/**
 * A gramática de câmera — um movimento por TIPO de plano.
 *
 * ## Por que isto existe
 *
 * É a resposta estrutural para "os vídeos não podem ficar todos iguais". A
 * variação precisa sair do DADO, não de sorteio: sorteio produz aleatoriedade,
 * que depois de dez vídeos parece igual do mesmo jeito. Aqui, dois imóveis com
 * fotos diferentes produzem sequências diferentes por construção, porque o
 * `alt` de cada foto decide o tipo do plano e o tipo decide o movimento.
 *
 * O `alt` serve para isso porque as 265 fotos de produção foram descritas por
 * visão em 08/2026 — é o mesmo truque de `lazerFotos.ts` e de
 * `fotoParaObjetivo` em `marketing.ts`.
 *
 * ## A escolha de movimento é linguagem de cinema, não enfeite
 *
 * Fachada pede TILT porque subir revela a altura do prédio, que é o que o
 * cliente quer saber. Ambiente interno pede PUSH porque aproximar é o gesto de
 * quem entra. Lazer pede PAN porque a extensão é o argumento. Implantação pede
 * PULL porque afastar é o que revela o conjunto.
 *
 * ## Toda curva tem aceleração, e isso foi o achado mais visível
 *
 * Movimento LINEAR é o que denuncia slideshow. Movimento que desacelera no fim
 * parece operador de câmera. As expressões usam `pow(1-t,3)` (ease-out cúbico)
 * — medido lado a lado na exploração de 03/09/2026, é a diferença mais barata
 * e mais perceptível de todo o motor.
 *
 * Módulo PURO, sem `server-only`: a tela precisa dos rótulos, e as expressões
 * precisam ser testáveis sem FFmpeg. Mesma pedra de `imagensTipos.ts`.
 */

export type TipoDePlano = "fachada" | "interior" | "lazer" | "implantacao";
export type Movimento = "tilt" | "push" | "pan" | "pull";

export type RegraDePlano = {
  tipo: TipoDePlano;
  rotulo: string;
  /** Casa contra o `alt` da foto. A ordem da lista é a ordem de prioridade. */
  alt: RegExp;
  movimento: Movimento;
  /** O que o movimento faz pela venda — aparece na tela do corretor. */
  ajuda: string;
};

/**
 * A ordem importa: a primeira regra que casar vence. `implantacao` vem antes
 * de `fachada` porque "planta de implantação do condomínio com torres" casaria
 * nas duas, e o movimento certo ali é o que revela o conjunto, não o que sobe.
 */
export const REGRAS_DE_PLANO: readonly RegraDePlano[] = [
  {
    tipo: "implantacao",
    rotulo: "Implantação",
    alt: /implanta[çc][ãa]o|planta do condom[íi]nio|vista a[ée]rea|perspectiva a[ée]rea|masterplan/i,
    movimento: "pull",
    ajuda: "Afasta revelando o conjunto inteiro.",
  },
  {
    tipo: "fachada",
    rotulo: "Fachada",
    alt: /fachada|torres?|edif[íi]cio|pr[ée]dio|entrada|portaria|guarita|acesso|exterior/i,
    movimento: "tilt",
    ajuda: "Sobe revelando a altura do prédio.",
  },
  {
    tipo: "lazer",
    rotulo: "Lazer",
    /*
     * "gourmet" sozinho NÃO entra, e isso não é detalhe: "cozinha gourmet" é
     * o interior do apartamento e "espaço gourmet" é a área comum. Sem a
     * palavra que especifica, um living vira lazer e ganha um PAN onde devia
     * ganhar um PUSH. É a mesma trava que `lazerFotos.ts` precisou ter depois
     * que "Espaço Gourmet" abriu a foto do espaço PET.
     */
    alt: /piscina|academia|playground|brinquedoteca|pet\s*place|churrasq|(espa[çc]o|[áa]rea|sal[ãa]o)\s+gourmet|sal[ãa]o de festas|quadra|coworking|spa\b|sauna|deck|pub\b|lounge|jardim/i,
    movimento: "pan",
    ajuda: "Percorre lateralmente, mostrando a extensão.",
  },
  {
    tipo: "interior",
    rotulo: "Interior",
    alt: /living|sala|estar|jantar|cozinha|varanda|su[íi]te|dormit[óo]rio|quarto|banheiro|home|integrad/i,
    movimento: "push",
    ajuda: "Aproxima devagar, como quem entra no ambiente.",
  },
];

/**
 * O tipo do plano a partir do `alt`.
 *
 * Sem casamento, cai em `interior` — que usa PUSH, o movimento mais neutro e
 * o que menos estraga uma foto que não sabemos o que é. Errar para o lado do
 * genérico custa uma tomada morna; errar para o TILT numa foto de sofá sobe a
 * câmera pelo teto.
 */
export function tipoDoPlano(alt: string | null | undefined): TipoDePlano {
  const texto = (alt ?? "").trim();
  if (!texto) return "interior";
  for (const regra of REGRAS_DE_PLANO) {
    if (regra.alt.test(texto)) return regra.tipo;
  }
  return "interior";
}

export function regraDoTipo(tipo: TipoDePlano): RegraDePlano {
  const regra = REGRAS_DE_PLANO.find((r) => r.tipo === tipo);
  if (!regra) throw new Error(`tipo de plano desconhecido: ${tipo}`);
  return regra;
}

export function movimentoDoPlano(alt: string | null | undefined): Movimento {
  return regraDoTipo(tipoDoPlano(alt)).movimento;
}

/** As três expressões que o `zoompan` do FFmpeg consome. */
export type ExpressaoDeCamera = { z: string; x: string; y: string };

/**
 * A matemática do movimento, como expressão de FFmpeg.
 *
 * Fica aqui, e não no script de render, porque expressão errada não dá erro:
 * dá um vídeo com a câmera parada, ou tremendo, ou saindo pela borda. Módulo
 * puro é o que permite testar isso sem renderizar nada.
 *
 * `on` é o número do quadro de SAÍDA — é a variável que o `zoompan` expõe. Não
 * existe `n` neste filtro (custou uma tentativa descobrir).
 */
export function expressaoDeCamera(movimento: Movimento, quadros: number): ExpressaoDeCamera {
  if (!Number.isFinite(quadros) || quadros < 1) {
    throw new Error(`quadros precisa ser >= 1, recebido: ${quadros}`);
  }
  const n = Math.round(quadros);
  /** Ease-out cúbico: 0 no começo, 1 no fim, desacelerando. */
  const t = `(1-pow(1-on/${n},3))`;
  const centro = { x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };

  switch (movimento) {
    case "tilt":
      // Zoom alto e quase fixo: é ele que cria a folga vertical para a câmera
      // subir. Com zoom 1.0 não sobra nenhum pixel para percorrer.
      return { z: `1.34-0.06*pow(1-on/${n},3)`, x: centro.x, y: `(ih-ih/zoom)*${t}` };
    case "push":
      return { z: `1.18-0.18*pow(1-on/${n},3)`, x: centro.x, y: centro.y };
    case "pan":
      // Zoom fixo e travessia lateral. Começa em 12% e anda 76% da folga: as
      // bordas exatas de uma foto costumam ser o pior enquadramento dela.
      return { z: "1.22", x: `(iw-iw/zoom)*(0.12+0.76*${t})`, y: centro.y };
    case "pull":
      return { z: `1.02+0.24*pow(1-on/${n},3)`, x: centro.x, y: centro.y };
  }
}

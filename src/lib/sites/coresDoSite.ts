// As quatro cores do site de cada imobiliária ("Meu site", 0210, 21/10/2026).
//
// Módulo PURO. Principal (botões, links, destaques), secundária (etiquetas,
// selos, segundo tom dos degradês), fundo das páginas e texto. Daqui saem as
// variáveis CSS que o site do grupo aplica, o contraste (WCAG) que a tela
// avisa e os temas prontos de um clique.
//
// REGRA DO DONO: a Next Home (grupo 1) nunca passa por aqui — quem chama só
// monta o CSS quando o site é de outro grupo e tem alguma cor escolhida.

import {
  TEXTO_CLARO,
  TEXTO_ESCURO,
  contraste,
  luminancia,
  misturar,
  rgbDe,
  textoSobreACor,
  variaveisDaCor,
} from "./siteEditavel";

export type CoresDoSite = {
  principal: string | null;
  secundaria: string | null;
  fundo: string | null;
  texto: string | null;
};

export const CORES_EM_BRANCO: CoresDoSite = { principal: null, secundaria: null, fundo: null, texto: null };

/** As cores do site com as do MODO ESCURO (0212), opcionais. `escuro` ausente ou vazio = a 0210, byte a byte. */
export type CoresDoSiteComEscuro = Partial<CoresDoSite> & { escuro?: Partial<CoresDoSite> | null };

/** O mínimo de contraste (WCAG AA) para texto normal. */
export const CONTRASTE_MINIMO = 4.5;

const HEX = /^#[0-9a-f]{6}$/;

/** Cor válida (`#rrggbb` minúsculo) ou nulo: nada que não seja hex chega ao CSS. */
function hexOuNulo(valor: string | null | undefined): string | null {
  return valor && HEX.test(valor) ? valor : null;
}

/** Só as cores bem formadas: o que veio do banco ou do navegador é conferido de novo. */
export function limparCores(c: Partial<CoresDoSite>): CoresDoSite {
  return {
    principal: hexOuNulo(c.principal),
    secundaria: hexOuNulo(c.secundaria),
    fundo: hexOuNulo(c.fundo),
    texto: hexOuNulo(c.texto),
  };
}

export function temAlgumaCor(c: CoresDoSite): boolean {
  return Boolean(c.principal || c.secundaria || c.fundo || c.texto);
}

/** Fundo e texto são definidos pelo grupo: o seletor claro/escuro deixa de fazer sentido. */
export function fixaFundoETexto(c: CoresDoSite): boolean {
  return Boolean(c.fundo || c.texto);
}

// ── Temas prontos ─────────────────────────────────────────────────────────

export type TemaPronto = { id: string; nome: string; cores: Required<{ [K in keyof CoresDoSite]: string }> };

export const TEMAS_PRONTOS: readonly TemaPronto[] = [
  {
    id: "azul-confianca",
    nome: "Azul confiança",
    cores: { principal: "#1d4ed8", secundaria: "#0369a1", fundo: "#f3f7fd", texto: "#0f1f3d" },
  },
  {
    id: "verde-natureza",
    nome: "Verde natureza",
    cores: { principal: "#2f6f4e", secundaria: "#8a6a38", fundo: "#f2f6ee", texto: "#1b2b21" },
  },
  {
    id: "grafite-elegante",
    nome: "Grafite elegante",
    cores: { principal: "#374151", secundaria: "#8a6a38", fundo: "#f4f4f5", texto: "#18181b" },
  },
  {
    id: "vinho-sofisticado",
    nome: "Vinho sofisticado",
    cores: { principal: "#7f1d3a", secundaria: "#8a6a38", fundo: "#faf5f2", texto: "#2a1519" },
  },
  {
    id: "grafite-noturno",
    nome: "Grafite noturno",
    cores: { principal: "#d4b483", secundaria: "#8fb9e3", fundo: "#151718", texto: "#f2f2f0" },
  },
  {
    id: "claro-minimalista",
    nome: "Claro minimalista",
    cores: { principal: "#111827", secundaria: "#4b5563", fundo: "#ffffff", texto: "#111827" },
  },
];

/** Temas prontos só do modo escuro (0212): preenchem as quatro cores do escuro e nada do claro. */
export const TEMAS_ESCUROS_PRONTOS: readonly TemaPronto[] = [
  {
    id: "verde-e-dourado",
    nome: "Verde e dourado",
    cores: { principal: "#d4a64b", secundaria: "#e8c77e", fundo: "#0e1a10", texto: "#f3ebd6" },
  },
];

// ── Contraste ─────────────────────────────────────────────────────────────

/** Fundo e texto que valem de fato: o que falta é deduzido do outro, pelo contraste. */
export function fundoETextoEfetivos(c: CoresDoSite): { fundo: string; texto: string } | null {
  if (!c.fundo && !c.texto) return null;
  if (c.fundo && c.texto) return { fundo: c.fundo, texto: c.texto };
  if (c.fundo) {
    return { fundo: c.fundo, texto: textoSobreACor(c.fundo) === TEXTO_CLARO ? "#f4f7f6" : "#101a17" };
  }
  const texto = c.texto as string;
  // Só o texto: o fundo é o extremo (branco ou quase preto) que mais o destaca.
  return { fundo: textoSobreACor(texto) === TEXTO_CLARO ? "#f7faf9" : "#0b1210", texto };
}

export type AvisoDeContraste = {
  campo: "texto" | "principal";
  razao: number;
  mensagem: string;
};

const arredondar = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** Os avisos de leitura das cores escolhidas (nunca bloqueiam o salvar). */
export function avisosDeContraste(c: CoresDoSite): AvisoDeContraste[] {
  const avisos: AvisoDeContraste[] = [];
  if (c.texto && c.fundo) {
    const razao = contraste(c.texto, c.fundo);
    if (razao < CONTRASTE_MINIMO) {
      avisos.push({
        campo: "texto",
        razao,
        mensagem: `O texto sobre o fundo tem contraste ${arredondar(razao)}:1; o mínimo para ler com conforto é 4,5:1.`,
      });
    }
  }
  if (c.principal) {
    // O texto sobre a cor é sempre o de maior contraste (branco ou escuro), e o
    // melhor dos dois nunca fica abaixo de 4,58:1 (a média geométrica de 21).
    // Fica como rede de segurança, se um dia o texto do botão deixar de ser automático.
    const razao = contraste(c.principal, textoSobreACor(c.principal));
    if (razao < CONTRASTE_MINIMO) {
      avisos.push({
        campo: "principal",
        razao,
        mensagem: `O texto dos botões sobre a cor principal tem contraste ${arredondar(razao)}:1; o mínimo é 4,5:1.`,
      });
    }
  }
  return avisos;
}

/** Leva `cor` na direção de `alvo` até o contraste com `base` chegar ao mínimo. */
function aproximar(cor: string, alvo: string, base: string, minimo: number): string {
  let atual = cor;
  for (let passo = 1; passo <= 20 && contraste(atual, base) < minimo; passo += 1) {
    atual = misturar(cor, alvo, passo / 20);
  }
  return atual;
}

/** "Ajustar automaticamente" o texto: escurece ou clareia até ler bem sobre o fundo. */
export function ajustarTexto(texto: string, fundo: string, minimo: number = CONTRASTE_MINIMO): string {
  if (contraste(texto, fundo) >= minimo) return texto;
  const alvo = contraste(TEXTO_CLARO, fundo) >= contraste(TEXTO_ESCURO, fundo) ? TEXTO_CLARO : TEXTO_ESCURO;
  return aproximar(texto, alvo, fundo, minimo);
}

/** Escurece a cor até o texto BRANCO ler sobre ela (os botões antigos do site têm `text-white` fixo). */
export function paraTextoBranco(hex: string, minimo: number = CONTRASTE_MINIMO): string {
  let atual = hex;
  for (let passo = 1; passo <= 20 && contraste(atual, TEXTO_CLARO) < minimo; passo += 1) {
    atual = misturar(hex, TEXTO_ESCURO, passo / 20);
  }
  return atual;
}

/** "Ajustar automaticamente" a cor principal: o texto dos botões passa a ler bem sobre ela. */
export function ajustarPrincipal(principal: string, minimo: number = CONTRASTE_MINIMO): string {
  const sobre = textoSobreACor(principal);
  if (contraste(principal, sobre) >= minimo) return principal;
  const alvo = sobre === TEXTO_CLARO ? TEXTO_ESCURO : TEXTO_CLARO;
  let atual = principal;
  for (let passo = 1; passo <= 20 && contraste(atual, sobre) < minimo; passo += 1) {
    atual = misturar(principal, alvo, passo / 20);
  }
  return atual;
}

// ── Variáveis CSS ─────────────────────────────────────────────────────────

const DEGRAUS = [
  [50, "#ffffff", 0.92],
  [100, "#ffffff", 0.82],
  [200, "#ffffff", 0.64],
  [300, "#ffffff", 0.42],
  [400, "#ffffff", 0.2],
  [500, "#000000", 0],
  [600, "#000000", 0.2],
  [700, "#000000", 0.4],
  [800, "#000000", 0.6],
  [900, "#000000", 0.78],
  [950, "#000000", 0.89],
] as const;

/** Uma escala de 50 a 950 que parte da cor no degrau 500 (como as escalas `brand` e `azure`). */
export function escalaDaCor(hex: string): Record<number, string> {
  return Object.fromEntries(DEGRAUS.map(([n, alvo, parte]) => [n, misturar(hex, alvo, parte)]));
}

function comAlfa(hex: string, alfa: number): string {
  return `rgb(${rgbDe(hex)} / ${alfa})`;
}

/**
 * As variáveis CSS do site do grupo. Reaponta o acento e a escala `brand`
 * (que muitos componentes usam direto, como o botão "Buscar imóveis" do
 * herói), a escala `azure` e o `realce` (a segunda cor) e, quando há fundo
 * ou texto, os PAPÉIS de superfície e de texto — nos dois temas.
 *
 * O texto de acento (links, `acento-suave`) é puxado até ler bem sobre o
 * fundo quando o grupo escolheu um: cor escura demais num fundo escuro (ou
 * clara num claro) não vira texto ilegível.
 */
export function variaveisDoSite(entrada: Partial<CoresDoSite>): Record<string, string> {
  const c = limparCores(entrada);
  const v: Record<string, string> = {};
  const papeis = fundoETextoEfetivos(c);

  if (c.principal) {
    Object.assign(v, variaveisDaCor(c.principal));
    v["--color-acento-intenso"] = v["--color-acento-hover"];
    // A escala `brand` é o que os botões do site pedem por classe (`bg-brand-500
    // text-white`): o degrau 500 precisa aguentar texto branco, senão uma cor
    // clara deixaria o "Buscar imóveis" ilegível. O acento (`--color-acento`)
    // segue a cor exata e leva o texto automático.
    for (const [n, cor] of Object.entries(escalaDaCor(paraTextoBranco(c.principal)))) v[`--color-brand-${n}`] = cor;
    if (papeis) {
      const legivel = ajustarTexto(c.principal, papeis.fundo);
      v["--color-acento-suave"] = legivel;
      v["--color-acento-forte"] = legivel;
      v["--color-acento-intenso"] = ajustarTexto(v["--color-acento-hover"], papeis.fundo);
    }
  }

  if (c.secundaria) {
    const legivel = papeis ? ajustarTexto(c.secundaria, papeis.fundo) : c.secundaria;
    v["--color-realce"] = c.secundaria;
    v["--color-realce-suave"] = legivel;
    v["--color-realce-lavado"] = comAlfa(c.secundaria, 0.14);
    v["--color-realce-linha"] = comAlfa(c.secundaria, 0.34);
    for (const [n, cor] of Object.entries(escalaDaCor(c.secundaria))) v[`--color-azure-${n}`] = cor;
    // O realce é usado como TEXTO (selo de estágio): no fundo do grupo ele precisa ler.
    if (papeis) v["--color-realce"] = legivel;
  }

  if (papeis) {
    const { fundo, texto } = papeis;
    v["--color-fundo"] = fundo;
    v["--color-superficie"] = misturar(fundo, texto, 0.05);
    v["--color-elevado"] = misturar(fundo, texto, 0.09);
    v["--color-campo"] = misturar(fundo, texto, 0.02);
    v["--color-linha"] = comAlfa(texto, 0.14);
    v["--color-linha-forte"] = comAlfa(texto, 0.26);
    v["--color-vidro"] = comAlfa(texto, 0.05);
    v["--color-vidro-forte"] = comAlfa(texto, 0.1);
    v["--color-vidro-mais"] = comAlfa(texto, 0.17);
    v["--color-titulo"] = texto;
    v["--color-corpo"] = misturar(texto, fundo, 0.1);
    v["--color-corpo-suave"] = misturar(texto, fundo, 0.18);
    v["--color-apoio"] = ajustarTexto(misturar(texto, fundo, 0.32), fundo, 4.5);
    v["--color-legenda"] = v["--color-apoio"];
    v["--color-tenue"] = ajustarTexto(misturar(texto, fundo, 0.42), fundo, 3);
  }
  return v;
}

/** `light` ou `dark`, pelo fundo escolhido: controles nativos (rolagem, campos) acompanham. */
export function esquemaDoFundo(fundo: string): "light" | "dark" {
  return luminancia(fundo) > 0.35 ? "light" : "dark";
}

/**
 * O CSS que o layout do site do grupo injeta. Vai em `:root` (e não num
 * envoltório) porque o fundo pinta o `<body>` e o menu do celular é um portal
 * fora de qualquer envoltório. Fora de `@layer`, vence os dois temas sem
 * depender de especificidade. Só sai hex calculado aqui: nada digitado
 * chega ao CSS. Nulo = sem nenhuma cor, nada a injetar.
 */
export function cssDasCoresDoSite(entrada: CoresDoSiteComEscuro): string | null {
  const c = limparCores(entrada);
  const e = limparCores(entrada.escuro ?? {});
  if (!temAlgumaCor(e)) return cssDoClaro(c, ":root", true);
  // Com cores do escuro (0212): o bloco do claro vale só fora do escuro, com o
  // mesmo conteúdo de sempre; o escuro tem o seu; o seletor nunca some.
  const claro = cssDoClaro(c, ':root:not([data-tema="escuro"])', false);
  return (claro ?? "") + cssDoEscuro(c, e);
}

/** O bloco do tema claro (ou do site inteiro, sem cores do escuro): o de sempre. */
function cssDoClaro(c: CoresDoSite, seletor: string, esconderSeletor: boolean): string | null {
  if (!temAlgumaCor(c)) return null;
  const v = variaveisDoSite(c);
  const linhas = Object.entries(v).map(([k, valor]) => `${k}:${valor}`);
  const papeis = fundoETextoEfetivos(c);
  if (papeis) linhas.unshift(`color-scheme:${esquemaDoFundo(papeis.fundo)}`);
  let css = `${seletor}{${linhas.join(";")}}`;
  // Fundo e texto fixos: o claro/escuro do visitante não mexe mais nas superfícies.
  if (esconderSeletor && fixaFundoETexto(c)) css += `[role="radiogroup"][aria-label="Tema"]{display:none}`;
  return css;
}

/** As cores que o tema escuro usa: as dele e, no que faltar da marca, a principal e a secundária do claro. */
export function coresEfetivasDoEscuro(claro: CoresDoSite, escuro: CoresDoSite): CoresDoSite {
  return {
    principal: escuro.principal ?? claro.principal,
    secundaria: escuro.secundaria ?? claro.secundaria,
    fundo: escuro.fundo,
    texto: escuro.texto,
  };
}

function cssDoEscuro(claro: CoresDoSite, escuro: CoresDoSite): string {
  const efetivas = coresEfetivasDoEscuro(claro, escuro);
  const linhas = Object.entries(variaveisDoSite(efetivas)).map(([k, valor]) => `${k}:${valor}`);
  const papeis = fundoETextoEfetivos(efetivas);
  // Sem fundo próprio vale o escuro da casa; com ele, os controles nativos acompanham o fundo.
  linhas.unshift(`color-scheme:${papeis ? esquemaDoFundo(papeis.fundo) : "dark"}`);
  return `:root[data-tema="escuro"]{${linhas.join(";")}}`;
}

/** O que a prévia da tela mostra: o mesmo cálculo do site, com um fundo padrão para o que ficou vazio. */
export function variaveisDaPrevia(entrada: Partial<CoresDoSite>): Record<string, string> {
  const c = limparCores(entrada);
  return variaveisDoSite({
    ...c,
    fundo: c.fundo ?? (c.texto ? null : "#cfd9c2"),
    texto: c.texto ?? (c.fundo ? null : "#183630"),
  });
}

/** Fundo e texto padrão da prévia do escuro (o escuro da casa, que leem bem). */
const PREVIA_ESCURA = { fundo: "#0b1210", texto: "#e6eeea" } as const;

/**
 * A prévia do modo escuro: o mesmo cálculo do site (`coresEfetivasDoEscuro` +
 * `variaveisDoSite`), com o fundo e o texto escuros padrão no que ficou vazio.
 */
export function variaveisDaPreviaEscura(claro: Partial<CoresDoSite>, escuro: Partial<CoresDoSite>): Record<string, string> {
  const ef = coresEfetivasDoEscuro(limparCores(claro), limparCores(escuro));
  return variaveisDoSite({
    ...ef,
    fundo: ef.fundo ?? (ef.texto ? null : PREVIA_ESCURA.fundo),
    texto: ef.texto ?? (ef.fundo ? null : PREVIA_ESCURA.texto),
  });
}

// ── Tema travado pelo fundo ───────────────────────────────────────────────

/**
 * O site com fundo e texto FIXOS num fundo escuro (e sem cores próprias do
 * escuro) precisa do `data-tema="escuro"` no `<html>`.
 *
 * Achado na Aretz (26/10/2026): as cores fixas trocam as VARIÁVEIS, mas as
 * superfícies que o `globals.css` escreve por tema (vidro dos cartões, a
 * faixa da planta, o cabeçalho) seguem o `data-tema`. Sem cookie o HTML nasce
 * claro, e no celular — onde ninguém tinha escolhido o escuro — o fundo
 * verde-quase-preto saía com vidro claro e texto apagado por cima. No
 * computador de quem testou, o cookie do escuro escondia o defeito.
 *
 * Nulo = nada a travar (fundo claro, sem fundo fixo, ou com cores do escuro,
 * caso em que o seletor existe e o visitante escolhe).
 */
export function temaFixoDoSite(entrada: CoresDoSiteComEscuro): { tema: "escuro"; fundo: string } | null {
  const c = limparCores(entrada);
  if (temAlgumaCor(limparCores(entrada.escuro ?? {}))) return null;
  const papeis = fundoETextoEfetivos(c);
  if (!papeis || esquemaDoFundo(papeis.fundo) !== "dark") return null;
  return { tema: "escuro", fundo: papeis.fundo };
}

/**
 * O script inline que trava o escuro antes da pintura (o mesmo trabalho do
 * `SCRIPT_TEMA_ANTES_DA_PINTURA`, que roda antes dele e lê o cookie): tema,
 * cor da barra do navegador = o fundo do site, e `color-scheme`. Só sai hex
 * já conferido por `limparCores`; nada digitado chega aqui.
 */
export function scriptDoTemaFixo(fixo: { tema: "escuro"; fundo: string }): string {
  return (
    'try{var h=document.documentElement;h.setAttribute("data-tema","escuro");' +
    `var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","${fixo.fundo}");` +
    `var s=document.querySelector('meta[name="color-scheme"]');if(s)s.setAttribute("content","dark")}catch(e){}`
  );
}

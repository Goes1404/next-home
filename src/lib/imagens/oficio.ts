/**
 * O OFÍCIO: o que um fotógrafo sabe e o corretor não tem motivo para saber.
 *
 * ## Por que isto não cabia em nenhum dos módulos que já existem
 *
 * - `receitas.ts` guarda a espinha de CADA TRABALHO (mobiliar, fachada,
 *   melhorar luz). É específica por tarefa e o corretor a ESCOLHE.
 * - `gramatica.ts` guarda a FORMA do texto: as quatro seções, o tamanho, a
 *   técnica de texto literal entre aspas.
 * - Aqui mora o que vale para toda imagem, independente da receita e da
 *   forma — e que é justamente onde a imagem gerada entrega que é gerada.
 *
 * ## O domínio manda tanto quanto o regime
 *
 * O Estúdio deixou de assumir que todo pedido é de imóvel (11/09/2026), e
 * `turno.ts` já resolve isso sem LLM: `dominio` é `"imovel"` quando o
 * corretor citou um empreendimento do catálogo, e `"livre"` quando não. Uma
 * regra que fala de "verticais do prédio" injetada num retrato de cachorro é
 * exatamente o defeito que `conferir` teve de desfazer — acusar (ou instruir)
 * sobre um assunto que não está ali.
 *
 * ## A régua de entrada: específico e acionável, nunca elogio
 *
 * "Faça uma imagem de alta qualidade" não muda pixel nenhum — o modelo já
 * está tentando. "Verticais aprumadas, sem o prédio caindo para trás" muda.
 * Cada regra aqui aponta um DEFEITO CONHECIDO e diz o que fazer no lugar; a
 * que não conseguir fazer isso não entra.
 *
 * ## E o teto, que é uma tensão real desta base
 *
 * `tradutor.ts` registra que prompt gigante DILUI o assunto — é o defeito
 * que ele existe para consertar. Por isso cada regra é UMA linha, e a lista
 * é filtrada pelo regime: criar do zero e editar foto pedem ofícios
 * diferentes, e mandar os dois juntos gastaria metade do bloco com
 * instrução que não se aplica.
 *
 * Módulo PURO, sem `server-only`: a tela é `"use client"` e pode listar o
 * que foi aplicado. Mesma pedra de `limitesPdf.ts` e `imagensTipos.ts`.
 */

/** Quando a regra vale: em toda imagem, só criando, ou só editando foto. */
export type Regime = "criacao" | "edicao";

/** Sobre o que é o pedido — o mesmo vocabulário que `turno.ts` já usa. */
export type Dominio = "imovel" | "livre";

export type Habilidade = {
  chave: string;
  /** Nome curto, para a tela poder dizer o que foi aplicado. */
  rotulo: string;
  /** O defeito que ela evita — é isto que justifica ela ocupar espaço. */
  evita: string;
  /** A linha que vai para o prompt. Uma só, imperativa, concreta. */
  regra: string;
  vale: "sempre" | Regime;
  /** `"imovel"` só entra quando o pedido é sobre um empreendimento. */
  dominio: "sempre" | Dominio;
};

export const HABILIDADES: Habilidade[] = [
  {
    chave: "verticais",
    rotulo: "Verticais aprumadas",
    evita: "o prédio 'caindo para trás', que é a assinatura de foto de celular",
    regra:
      "Linhas verticais do prédio aprumadas, com correção de perspectiva " +
      "(efeito tilt-shift), nunca convergindo para o topo.",
    vale: "sempre",
    dominio: "imovel",
  },
  {
    chave: "hora_certa",
    rotulo: "A hora que vende",
    evita: "o meio-dia de sol a pino, que achata volume e estoura o céu",
    regra:
      "Para exterior, prefira o fim de tarde ou a hora azul COM as luzes " +
      "internas e da fachada acesas — é a foto que o mercado usa como capa.",
    vale: "criacao",
    dominio: "imovel",
  },
  {
    chave: "ceu_honesto",
    rotulo: "Céu sem HDR",
    evita: "o céu roxo-alaranjado saturado que denuncia imagem artificial",
    regra:
      "Céu com nuvens leves e cor natural, contraste suave; nada de saturação " +
      "exagerada nem halo de HDR nas bordas do edifício.",
    vale: "sempre",
    dominio: "imovel",
  },
  {
    chave: "escala",
    rotulo: "Escala humana sem rosto",
    evita: "a cena vazia, que parece maquete e não lugar onde se mora",
    regra:
      "Uma ou duas figuras humanas DISTANTES e desfocadas dão escala e vida; " +
      "nenhuma com rosto reconhecível, nenhuma em primeiro plano.",
    vale: "sempre",
    dominio: "sempre",
  },
  {
    chave: "um_heroi",
    rotulo: "Um assunto só",
    evita: "a imagem poluída, com três focos disputando o olho",
    regra:
      "A cena tem UM assunto principal, claramente dominante no quadro; o " +
      "resto é contexto e fica subordinado a ele.",
    vale: "sempre",
    dominio: "sempre",
  },
  {
    chave: "coerencia",
    rotulo: "Sombra e reflexo coerentes",
    evita: "o erro clássico de imagem gerada: sombra e reflexo contradizendo a luz",
    regra:
      "Sombras, reflexos e ponto de fuga coerentes com uma única fonte de " +
      "luz principal.",
    vale: "sempre",
    dominio: "sempre",
  },
  {
    chave: "respiro",
    rotulo: "Respiro para o texto",
    evita: "a frase ilegível por cair em cima de detalhe",
    regra:
      "Quando houver texto na imagem, reserve para ele uma área limpa e de " +
      "pouca textura, e mantenha o assunto fora dela.",
    vale: "sempre",
    dominio: "sempre",
  },
  {
    chave: "preservar",
    rotulo: "O que a foto já tem não se reinventa",
    evita: "a 'edição' que devolve outro imóvel",
    regra:
      "Preserve a arquitetura, o enquadramento e as proporções que já estão " +
      "na foto; mude só o que foi pedido.",
    vale: "edicao",
    dominio: "sempre",
  },
];

/**
 * O bloco do ofício para um regime, pronto para entrar no prompt.
 *
 * Devolve só as linhas — sem título de seção — porque quem monta o prompt
 * decide onde elas entram. Vazio nunca acontece hoje (há regras `sempre`),
 * mas a função aguenta: lista vazia devolve string vazia, e o chamador
 * concatena sem criar um cabeçalho órfão.
 */
function aplicaveis(regime: Regime, dominio: Dominio): Habilidade[] {
  return HABILIDADES.filter(
    (h) =>
      (h.vale === "sempre" || h.vale === regime) &&
      (h.dominio === "sempre" || h.dominio === dominio),
  );
}

export function instrucaoDoOficio(regime: Regime, dominio: Dominio): string {
  const valem = aplicaveis(regime, dominio);
  if (valem.length === 0) return "";

  return [
    "O ofício (some no texto final sem virar lista):",
    ...valem.map((h) => `- ${h.regra}`),
  ].join("\n");
}

/** Os rótulos aplicados — para a tela poder dizer o que entrou. */
export function habilidadesDoRegime(regime: Regime, dominio: Dominio): string[] {
  return aplicaveis(regime, dominio).map((h) => h.rotulo);
}

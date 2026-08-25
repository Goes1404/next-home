import { STATUS_LABEL, TIPO_LABEL, type StatusObra, type TipoImovel } from "@/lib/types";

/**
 * O que a IA recebe para escrever a descrição comercial de um imóvel.
 *
 * Repare no que NÃO está aqui: preço, condomínio, IPTU e condições de
 * pagamento. É a mesma regra que vale no atendimento — a IA não fala
 * valores — aplicada pela via que funciona: o que o modelo não vê, ele não
 * repete. Instrução de prompt é probabilística e falha justo no texto que
 * vai para o ar; ausência de dado é determinística.
 */
export type EntradaDescricaoIA = {
  nome: string;
  tagline: string;
  /** O texto que o corretor já tem. Vazio = escrever do zero. */
  descricaoAtual: string;
  tipo: TipoImovel;
  status: StatusObra;
  cidade: string;
  bairro: string;
  construtora: string | null;
  entregaPrevista: string | null;
  totalUnidades: number | null;
  totalTorres: number | null;
  tipologias: {
    nome: string;
    areaPrivativa: number | null;
    dormitorios: number;
    suites: number;
    banheiros: number;
    vagas: number;
  }[];
  lazer: string[];
};

/** Teto do texto devolvido. Descrição de site não é folheto de construtora. */
export const TETO_DESCRICAO = 1200;

/** Mínimo para valer a troca — abaixo disso é frase solta, não descrição. */
export const PISO_DESCRICAO = 180;

function linhaTipologia(t: EntradaDescricaoIA["tipologias"][number]): string {
  const partes = [
    t.nome,
    t.areaPrivativa ? `${t.areaPrivativa} m² privativos` : null,
    `${t.dormitorios} ${t.dormitorios === 1 ? "dormitório" : "dormitórios"}`,
    t.suites > 0 ? `${t.suites} ${t.suites === 1 ? "suíte" : "suítes"}` : null,
    t.banheiros > 0 ? `${t.banheiros} ${t.banheiros === 1 ? "banheiro" : "banheiros"}` : null,
    t.vagas > 0 ? `${t.vagas} ${t.vagas === 1 ? "vaga" : "vagas"}` : null,
  ].filter(Boolean);
  return `- ${partes.join(", ")}`;
}

/**
 * Monta o prompt. Função pura e exportada de propósito: é ela que carrega
 * as regras de negócio do texto público, e regra de negócio que só existe
 * dentro de uma chamada de rede não tem como ser testada.
 *
 * Três decisões que vieram de erro cometido antes neste projeto:
 *
 * - **Rótulo humano, nunca o enum cru.** Com `em_construcao` na ficha, um
 *   modelo já afirmou a cliente que o imóvel estava "pronto para morar".
 * - **A ficha diz a AUSÊNCIA em voz alta.** Listar só o que existe fazia o
 *   modelo preencher o resto de cabeça — foi assim que "3 suítes" virou "1
 *   suíte" numa resposta a cliente.
 * - **Nada de markdown.** A descrição sai num `<p>` com `whitespace-pre-line`
 *   (ver Sobre.tsx): asterisco e cerca de código chegam CRUS na tela do
 *   visitante, exatamente como chegavam no WhatsApp.
 */
export function montarPromptDescricao(dados: EntradaDescricaoIA): string {
  const ficha = [
    `Nome: ${dados.nome}`,
    dados.tagline ? `Frase de impacto já usada: ${dados.tagline}` : null,
    `Tipo: ${TIPO_LABEL[dados.tipo]}`,
    `Estágio da obra: ${STATUS_LABEL[dados.status]}`,
    `Localização: ${[dados.bairro, dados.cidade].filter(Boolean).join(", ")}`,
    dados.construtora ? `Construtora: ${dados.construtora}` : "Construtora: NÃO INFORMADA",
    dados.entregaPrevista ? `Previsão de entrega: ${dados.entregaPrevista}` : "Previsão de entrega: NÃO INFORMADA",
    dados.totalTorres ? `Torres: ${dados.totalTorres}` : null,
    dados.totalUnidades ? `Unidades: ${dados.totalUnidades}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const plantas =
    dados.tipologias.length > 0
      ? dados.tipologias.map(linhaTipologia).join("\n")
      : "NENHUMA planta cadastrada — não afirme metragem, número de dormitórios, suítes ou vagas.";

  const lazer =
    dados.lazer.length > 0
      ? dados.lazer.join(", ")
      : "NENHUM item de lazer cadastrado — não cite piscina, academia, salão ou qualquer área comum.";

  const base = dados.descricaoAtual.trim();

  return `Você escreve textos para o site de uma imobiliária de Alphaville, Barueri e região.

Sua tarefa: ${base ? "REESCREVER a descrição abaixo, mantendo todo fato que ela já traz" : "ESCREVER a descrição comercial deste imóvel"}.

FICHA TÉCNICA (é a única fonte de verdade):
${ficha}

PLANTAS:
${plantas}

LAZER E ÁREAS COMUNS:
${lazer}
${base ? `\nDESCRIÇÃO ATUAL DO CORRETOR:\n${base}\n` : ""}
REGRAS OBRIGATÓRIAS:
1. NÃO INVENTE NADA. Só use o que está na ficha. Se um dado está marcado como NÃO INFORMADO ou NENHUM, ele não existe — não contorne com "amplo lazer" ou "entrega em breve".
2. NÃO cite preço, valor, condições de pagamento, financiamento, entrada ou desconto. Nem faixa, nem "a partir de".
3. NÃO use markdown: nada de asterisco, cerca de código, título com # ou lista com hífen. O texto vai direto para a tela, e o símbolo aparece cru.
4. Português do Brasil, terceira pessoa, tom de imobiliária de alto padrão: concreto e sóbrio. Sem "imperdível", "sonho realizado", "não perca".
5. De 2 a 3 parágrafos curtos, separados por linha em branco. No total, entre ${PISO_DESCRICAO} e ${TETO_DESCRICAO} caracteres.
6. Não repita a frase de impacto palavra por palavra — ela já aparece logo acima da descrição na página.

Responda SOMENTE um JSON válido, sem texto antes ou depois:
{"descricao": "o texto final, com \n\n separando os parágrafos"}`;
}

/** Marcas de markdown que chegam cruas na tela — o `<p>` não as interpreta. */
function limparMarkdown(texto: string): string {
  return texto
    .replace(/\*\*(.+?)\*\*/g, "$1")
    // O fecho do itálico costuma vir COLADO na pontuação (`*lançamento*.`);
    // exigir espaço depois deixava o asterisco na tela.
    .replace(/(^|\s)\*(\S.*?\S)\*(?=[\s.,;:!?)]|$)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/`{1,3}/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Lê a resposta do modelo. Devolve `null` quando não dá para usar — e o
 * chamador trata isso como falha, nunca como texto vazio: substituir a
 * descrição do corretor por nada seria destruir trabalho dele em silêncio.
 */
export function interpretarRespostaDescricao(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const bruto = (json as { descricao?: unknown }).descricao;
  if (typeof bruto !== "string") return null;

  const limpo = limparMarkdown(bruto);
  if (limpo.length < PISO_DESCRICAO) return null;
  // Corta em parágrafo inteiro quando passa do teto — frase pela metade no
  // ar é pior que um parágrafo a menos.
  if (limpo.length > TETO_DESCRICAO) {
    const paragrafos = limpo.split(/\n{2,}/);
    let acumulado = "";
    for (const p of paragrafos) {
      const candidato = acumulado ? `${acumulado}\n\n${p}` : p;
      if (candidato.length > TETO_DESCRICAO) break;
      acumulado = candidato;
    }
    return acumulado.length >= PISO_DESCRICAO ? acumulado : limpo.slice(0, TETO_DESCRICAO).trim();
  }
  return limpo;
}

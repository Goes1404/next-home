import type { Empreendimento } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

/**
 * O cliente pediu um dado que NÓS TEMOS — entregue agora.
 *
 * ## O alvo veio de contagem, não de palpite
 *
 * A primeira análise de erros deste projeto (16 conversas da v25, 134
 * anotações) devolveu duas categorias no topo, e as duas dizem a mesma
 * coisa:
 *
 * | categoria | conversas | ocorrências |
 * |---|---|---|
 * | nao-respondeu-a-pergunta | 10 de 16 | 18 |
 * | nao-informou-dado-permitido | 7 | **58 (43%)** |
 *
 * Não é falta de educação nem de tom: ela SEGURA informação que está na
 * ficha, na frente dela, permitida. Três versões de prompt foram gastas em
 * repetição, que é a segunda causa e provavelmente consequência desta —
 * cliente que não recebe resposta pergunta de novo.
 *
 * ## Por que em código
 *
 * A permissão de dizer o piso entrou na v28 e, corrigida na v29, é usada em
 * **~30% das conversas**: o piso apareceu em 4 de 13 transcrições, e na
 * persona que insiste em preço saiu em 1 de 4 rodadas. Instrução de prompt
 * é probabilística — a lição mais antiga da casa, e aqui ela custa a
 * resposta que o cliente pediu.
 *
 * Este módulo não pede ao modelo que lembre: ele monta a resposta a partir
 * do catálogo e manda dizê-la. Mesma construção do `resolverMidia`, em que
 * o código resolve a URL e a alucinação vira impossível.
 *
 * ## O erro é assimétrico, e o lado barato é responder demais
 *
 * Detectar uma pergunta que não foi feita injeta um fato verdadeiro e
 * irrelevante — custa uma frase. Não detectar devolve o defeito que está em
 * 10 de 16 conversas. Por isso a régua é generosa.
 *
 * ## O que ele NUNCA faz
 *
 * Não inventa. Todo valor sai do objeto do catálogo, e quando o dado não
 * existe o bloco diz a AUSÊNCIA em voz alta — a mesma regra do "SEM planta"
 * e do "SEM piso cadastrado". Listar só o que existe fazia o modelo
 * prometer o que não tem.
 */

export type TipoDeDado = "preco" | "metragem" | "dormitorios" | "entrega" | "endereco" | "lazer";

export interface DadoPedido {
  tipo: TipoDeDado;
  /** A resposta pronta, montada do catálogo. Vazio nunca. */
  resposta: string;
  /** Sobre qual imóvel — para o bloco não dizer "esse" sem antecedente. */
  imovel: string | null;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * O que cada pergunta parece. Só a fala do CLIENTE passa por aqui.
 *
 * `preco` inclui "quanto custa", "valor", "faixa" e as formas de pedir
 * desconto: quem pergunta desconto está perguntando quanto custa, e a
 * resposta certa começa pelo piso.
 */
const PERGUNTAS: Record<TipoDeDado, RegExp> = {
  preco:
    /\b(preco|precos|valor|valores|quanto custa|quanto sai|quanto fica|quanto e|faixa de preco|desconto|a partir de quanto|ta quanto|tabela)\b/,
  metragem: /\b(metragem|metros|m2|area|tamanho|quantos metros|qual o tamanho)\b/,
  dormitorios: /\b(dormitorio|dormitorios|quarto|quartos|dorm|suite|suites|planta|tipologia|tipologias)\b/,
  entrega: /\b(entrega|entregue|pronto|prazo|quando fica pronto|quando entrega|previsao)\b/,
  endereco: /\b(endereco|onde fica|onde e|localizacao|fica em que|qual rua|bairro)\b/,
  lazer: /\b(lazer|piscina|academia|churrasqueira|salao|playground|quadra|pet|coworking|espaco gourmet|area comum)\b/,
};

/**
 * "R$ 470.000" — com espaço NORMAL entre o cifrão e o número.
 *
 * `toLocaleString` devolve espaço INSEPARÁVEL (U+00A0), que é invisível na
 * tela e quebra qualquer comparação de texto: o valor sai igual aos olhos e
 * diferente para o código. Custou dois testes que falhavam mostrando duas
 * strings idênticas.
 *
 * É a única formatação de dinheiro do atendimento — o catálogo do prompt
 * usa esta mesma função. Duas versões da mesma cifra divergiriam, e é
 * justamente esse número que o modelo tem de copiar sem alterar.
 */
export function formatarReais(valor: number): string {
  return valor
    .toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    .replace(/\u00a0/g, " ");
}

/** "de 63 a 81 m²" / "63 m²" — a partir das tipologias cadastradas. */
function faixaDeArea(imovel: Empreendimento): string | null {
  const areas = imovel.tipologias
    .map((t) => t.areaPrivativa)
    .filter((a): a is number => typeof a === "number" && a > 0);

  if (areas.length === 0) return null;
  const min = Math.min(...areas);
  const max = Math.max(...areas);
  return min === max ? `${min} m²` : `de ${min} a ${max} m²`;
}

function tipologias(imovel: Empreendimento): string | null {
  const dorms = [...new Set(imovel.tipologias.map((t) => t.dormitorios).filter(Boolean))].sort();
  if (dorms.length === 0) return null;

  const suites = Math.max(0, ...imovel.tipologias.map((t) => t.suites || 0));
  const vagas = Math.max(0, ...imovel.tipologias.map((t) => t.vagas || 0));

  const partes = [`${dorms.join(" e ")} dormitório${dorms.some((d) => d > 1) ? "s" : ""}`];
  if (suites > 0) partes.push(`até ${suites} suíte${suites > 1 ? "s" : ""}`);
  if (vagas > 0) partes.push(`${vagas} vaga${vagas > 1 ? "s" : ""}`);
  return partes.join(", ");
}

/**
 * A resposta que temos para aquele tipo de pergunta, ou `null`.
 *
 * `null` significa "não temos o dado" — e aí o bloco não entra, porque o
 * prompt já sabe dizer que não tem. Bloco que manda responder o que não
 * existe é como a IA promete a planta que não está cadastrada.
 */
function respostaPara(tipo: TipoDeDado, imovel: Empreendimento): string | null {
  switch (tipo) {
    case "preco":
      return imovel.precoAPartir ? `a partir de ${formatarReais(imovel.precoAPartir)}` : null;
    case "metragem":
      return faixaDeArea(imovel);
    case "dormitorios":
      return tipologias(imovel);
    case "entrega":
      /*
       * Rótulo humano, nunca o enum cru: com `em_construcao` na ficha o
       * modelo já afirmou a um cliente que o imóvel estava "pronto para
       * morar". E a data só entra quando existe — prazo é a promessa mais
       * cara do negócio.
       */
      return imovel.entregaPrevista
        ? `${STATUS_LABEL[imovel.status]}, com entrega prevista para ${imovel.entregaPrevista}`
        : STATUS_LABEL[imovel.status];
    case "endereco":
      return imovel.endereco
        ? `${imovel.endereco}, ${imovel.bairro}, ${imovel.cidade}`
        : `${imovel.bairro}, ${imovel.cidade}`;
    case "lazer":
      return imovel.lazer.length > 0 ? imovel.lazer.slice(0, 8).join(", ") : null;
  }
}

/**
 * O piso mais baixo do catálogo, para quando o cliente pergunta preço sem
 * ter falado de imóvel nenhum.
 *
 * "Nossos lançamentos começam a partir de X" é a resposta honesta e útil de
 * quem não sabe ainda qual imóvel interessa — bem melhor que "depende".
 */
function pisoDoCatalogo(catalogo: readonly Empreendimento[]): string | null {
  const pisos = catalogo
    .map((e) => e.precoAPartir)
    .filter((p): p is number => typeof p === "number" && p > 0);

  return pisos.length > 0
    ? `o mais em conta do nosso catálogo começa em ${formatarReais(Math.min(...pisos))}`
    : null;
}

export function dadoPedido(params: {
  mensagem: string;
  /** O imóvel em foco (`focoDaConversa`). Sem foco, só `preco` responde. */
  imovel: Empreendimento | null;
  catalogo: readonly Empreendimento[];
}): DadoPedido | null {
  const texto = normalizar(params.mensagem);

  for (const tipo of Object.keys(PERGUNTAS) as TipoDeDado[]) {
    if (!PERGUNTAS[tipo].test(texto)) continue;

    if (params.imovel) {
      const resposta = respostaPara(tipo, params.imovel);
      if (resposta) return { tipo, resposta, imovel: params.imovel.nome };
      continue;
    }

    /*
     * Sem foco, dado de imóvel específico não tem resposta — "quantos
     * metros?" contra dez fichas seria escolher por ele. Preço é a exceção
     * porque o piso do catálogo responde de verdade.
     */
    if (tipo === "preco") {
      const piso = pisoDoCatalogo(params.catalogo);
      if (piso) return { tipo, resposta: piso, imovel: null };
    }
  }

  return null;
}

/**
 * O bloco do prompt. Curto e imperativo: ele precisa ganhar de 28 regras, e
 * regra longa perde — inclusive para si mesma, como a regra 13 provou.
 */
export function blocoDadoPedido(d: DadoPedido): string {
  /*
   * A frase vem PRONTA, não o dado solto.
   *
   * A primeira versão entregava "preco dos nossos lançamentos: a partir de
   * R$ 249.000" e o modelo respondeu "o valor a partir de cada imóvel é o
   * que temos" — entendeu o conceito e não disse o número. Dado solto ele
   * interpreta; frase pronta ele copia. Mesma razão de `resolverMidia`
   * montar a URL em vez de pedir que ele a escreva.
   */
  const frase = d.imovel ? `O ${d.imovel} ${d.resposta}.` : `${maiuscula(d.resposta)}.`;

  return [
    "RESPONDA ISTO NESTA MENSAGEM, ANTES DE QUALQUER PERGUNTA SUA — o cliente acabou de pedir:",
    `"${frase}"`,
    "",
    "Diga essa frase (pode ajustar a redação, NUNCA o número nem o dado).",
    "Não troque por \"depende\", \"varia\" ou \"vejo com você\": você TEM a informação, e segurá-la é o que mais trava esta conversa (medido em 10 de 16 conversas).",
    "Depois dela, siga normalmente: uma pergunta só, ou o convite para a visita.",
  ].join("\n");
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

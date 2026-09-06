/**
 * Os IDs do anúncio que originou um lead (roadmap Meta Ads, F0).
 *
 * ## Por que ID e não nome
 *
 * O webhook de Lead Ads já guardava `anuncio_origem` — o NOME do anúncio.
 * Nome é rótulo de exibição: muda no instante em que alguém renomeia o
 * anúncio no Gerenciador, e aí o lead de ontem deixa de casar com o gasto
 * de ontem. O gasto vive em `meta_ads_metricas.campanha_id`, que é ID; a
 * junção do CPL só existe se o lead guardar o mesmo tipo de chave.
 *
 * ## Por que uma chamada só
 *
 * A Graph API devolve o anúncio, o conjunto e a campanha na MESMA
 * requisição quando se pede `fields=name,adset{id,name},campaign{id,name}`.
 * Buscar em três chamadas triplicaria a latência de um webhook que a Meta
 * espera responder rápido — e que já faz uma chamada para os dados do lead.
 *
 * Este módulo é só a leitura da resposta, sem rede, para ser testável: o
 * formato do JSON da Meta é a parte que quebra calada quando eles mudam a
 * versão da API.
 */

/** O que a Graph API devolve para `GET /<ad_id>?fields=name,adset{...},campaign{...}`. */
export type RespostaAnuncioGraph = {
  id?: unknown;
  name?: unknown;
  adset?: { id?: unknown; name?: unknown } | null;
  campaign?: { id?: unknown; name?: unknown } | null;
};

export type IdsDoAnuncio = {
  /** Nome do anúncio — segue sendo o que a tela mostra. */
  nome: string | null;
  anuncioId: string | null;
  conjuntoId: string | null;
  campanhaId: string | null;
};

export const SEM_ANUNCIO: IdsDoAnuncio = {
  nome: null,
  anuncioId: null,
  conjuntoId: null,
  campanhaId: null,
};

/**
 * Os campos que a F0 pede à Graph API, num lugar só.
 *
 * Exportado para o teste poder afirmar que a URL do webhook pede `adset` e
 * `campaign` — a regressão aqui seria calada: a chamada continua
 * respondendo 200, só que sem os IDs, e o CPL volta a não existir sem
 * nenhum erro no caminho.
 */
export const CAMPOS_DO_ANUNCIO = "name,adset{id,name},campaign{id,name}";

/**
 * Um ID da Meta é uma sequência de dígitos.
 *
 * A checagem existe porque o JSON é externo e a coluna é `text`: sem ela,
 * um `null` do JSON viraria a string "null" no banco, e um objeto viraria
 * "[object Object]" — lixo que casa com nada e que ninguém percebe até
 * tentar juntar com o gasto. Valor que não é ID vira `null`, que é
 * honesto: "não sei qual campanha".
 */
function idValido(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isInteger(valor) && valor > 0) {
    return String(valor);
  }
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return /^\d{1,32}$/.test(limpo) ? limpo : null;
}

function textoCurto(valor: unknown, teto: number): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo.slice(0, teto) : null;
}

/**
 * Lê a resposta da Graph API. Nunca lança: webhook que estoura por causa
 * de um campo ausente perde o LEAD, que é o dado caro — os IDs são o
 * dado barato, e a ausência deles é recuperável depois.
 */
export function extrairIdsDoAnuncio(corpo: unknown, anuncioIdConhecido?: string): IdsDoAnuncio {
  const doWebhook = idValido(anuncioIdConhecido);

  if (!corpo || typeof corpo !== "object") {
    return { ...SEM_ANUNCIO, anuncioId: doWebhook };
  }

  const r = corpo as RespostaAnuncioGraph;

  return {
    nome: textoCurto(r.name, 160),
    // O `id` da resposta e o `ad_id` do evento são a mesma coisa; o do
    // evento entra como reserva porque a resposta pode vir sem ele.
    anuncioId: idValido(r.id) ?? doWebhook,
    conjuntoId: idValido(r.adset?.id),
    campanhaId: idValido(r.campaign?.id),
  };
}

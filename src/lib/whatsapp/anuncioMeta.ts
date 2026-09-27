/**
 * A mensagem veio de um anúncio da Meta? (27/09/2026)
 *
 * Os corretores impulsionam os próprios posts pelo Instagram/Facebook com o
 * botão "Enviar mensagem no WhatsApp". O cliente cai no número do corretor
 * com um texto pronto da Meta ("Olá! Posso obter mais informações sobre
 * isto?") — que não é a mensagem do nosso link `/wa/` nem uma frase de
 * entrada cadastrada. Desde a 0111 isso era descartado em silêncio: sem
 * lead, sem resposta e sem rastro, justamente o clique que o corretor PAGOU.
 *
 * Duas pistas, em ordem de confiança:
 *
 * 1. **A etiqueta que a Meta põe na mensagem** (`contextInfo.externalAdReply`
 *    no protocolo do WhatsApp, repassada pela Evolution). Traz o id do
 *    anúncio (`sourceId`), o título do post e o link. Conversa pessoal nunca
 *    tem essa etiqueta — é o que mantém a proteção do número pessoal.
 * 2. **O texto padrão da Meta**, quando a etiqueta não vem. Casamento EXATO
 *    contra a lista curta abaixo: ninguém abre conversa com a família
 *    escrevendo "Olá! Posso obter mais informações sobre isto?".
 *
 * Módulo PURO: o webhook passa o payload, os testes passam objetos.
 */

export type AnuncioMeta = {
  /** Id do anúncio na Meta (só dígitos), quando a etiqueta o traz. */
  adId: string | null;
  /** Título do post/anúncio, para a ficha e a lista do corretor. */
  titulo: string | null;
  /** Link do post, quando vem. */
  url: string | null;
  /** Como reconhecemos: pela etiqueta ou pelo texto padrão. */
  via: "etiqueta" | "texto_padrao";
};

type Obj = Record<string, unknown>;

function ehObjeto(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown, max = 200): string | null {
  if (typeof v !== "string") return null;
  const limpo = v.replace(/\s+/g, " ").trim();
  return limpo ? limpo.slice(0, max) : null;
}

function idDigitos(v: unknown): string | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return /^\d{5,30}$/.test(s) ? s : null;
}

/**
 * Todos os `contextInfo` que a mensagem pode carregar. A Evolution v2 copia o
 * da mensagem para `data.contextInfo`, mas nem toda versão faz isso — e o
 * `contextInfo` original mora dentro do tipo da mensagem
 * (`extendedTextMessage`, `imageMessage`…).
 */
function contextosDaMensagem(payload: unknown): Obj[] {
  if (!ehObjeto(payload)) return [];
  const data = ehObjeto(payload.data) ? payload.data : payload;
  const achados: Obj[] = [];
  if (ehObjeto(data.contextInfo)) achados.push(data.contextInfo);
  const mensagem = ehObjeto(data.message) ? data.message : null;
  if (mensagem) {
    if (ehObjeto(mensagem.contextInfo)) achados.push(mensagem.contextInfo);
    for (const valor of Object.values(mensagem)) {
      if (ehObjeto(valor) && ehObjeto(valor.contextInfo)) achados.push(valor.contextInfo);
    }
  }
  return achados;
}

/** A mensagem traz a etiqueta de anúncio da Meta? */
export function anuncioDaEtiqueta(payload: unknown): AnuncioMeta | null {
  for (const ctx of contextosDaMensagem(payload)) {
    const reply = ehObjeto(ctx.externalAdReply) ? ctx.externalAdReply : null;
    const fonteDaConversa = [ctx.conversionSource, ctx.entryPointConversionSource]
      .filter((v): v is string => typeof v === "string")
      .join(" ")
      .toLowerCase();

    const peloReply =
      reply !== null &&
      (String(reply.sourceType ?? "").toLowerCase() === "ad" ||
        typeof reply.ctwaClid === "string" ||
        reply.showAdAttribution === true);
    const pelaFonte = /\bads?\b|fb_ads|ctwa/.test(fonteDaConversa);

    if (!peloReply && !pelaFonte) continue;

    return {
      adId: idDigitos(reply?.sourceId),
      titulo: texto(reply?.title) ?? texto(reply?.body),
      url: texto(reply?.sourceUrl, 500),
      via: "etiqueta",
    };
  }
  return null;
}

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Os textos que a Meta pré-preenche no botão de WhatsApp do anúncio.
 * Lista CURTA e casamento exato: cada item a mais é uma chance de
 * cadastrar um parente. Texto personalizado pelo corretor entra pelas
 * frases de entrada, que ele mesmo cadastra.
 */
const TEXTOS_PADRAO_DA_META = [
  "Olá! Posso obter mais informações sobre isto?",
  "Olá! Posso obter mais informações sobre isso?",
  "Olá! Posso obter mais informações?",
  "Olá! Tenho interesse e queria mais informações, por favor.",
  "Olá! Quero saber mais sobre isto.",
  "Hello! Can I get more info on this?",
].map(normalizar);

export function ehTextoPadraoDaMeta(mensagem: string | null | undefined): boolean {
  if (!mensagem) return false;
  const limpo = normalizar(mensagem);
  return limpo.length > 0 && TEXTOS_PADRAO_DA_META.includes(limpo);
}

/** Título que a ficha recebe quando só o texto padrão identificou o anúncio. */
export const TITULO_SEM_ETIQUETA = "Impulsionamento (Instagram/Facebook)";

/**
 * A decisão inteira: etiqueta primeiro, texto padrão depois.
 */
export function reconhecerAnuncioMeta(params: {
  payload: unknown;
  texto: string | null | undefined;
}): AnuncioMeta | null {
  const pelaEtiqueta = anuncioDaEtiqueta(params.payload);
  if (pelaEtiqueta) return pelaEtiqueta;
  if (ehTextoPadraoDaMeta(params.texto)) {
    return { adId: null, titulo: null, url: null, via: "texto_padrao" };
  }
  return null;
}

/**
 * Só os NOMES dos campos de contexto, para o log de diagnóstico de número
 * ignorado. Nunca o conteúdo: é mensagem de quem ainda não é lead.
 */
export function chavesDeContexto(payload: unknown): string[] {
  const chaves = new Set<string>();
  for (const ctx of contextosDaMensagem(payload)) {
    for (const k of Object.keys(ctx)) chaves.add(k);
  }
  return [...chaves].sort();
}

/**
 * Leitura do histórico de um chat devolvido pela Evolution
 * (`POST /chat/findMessages/{instância}`), para a palavra-chave que cadastra
 * o lead (0146) trazer junto o que já foi conversado.
 *
 * Módulo puro: o formato da resposta muda entre versões da Evolution (lista
 * solta, `records`, `messages.records`), e é aqui que isso é absorvido e
 * testado, sem rede.
 *
 * Uma ressalva medida: a instância desta base NÃO guarda mensagens (em 30/09
 * a busca de mídia por id devolvia "Message not found" em 100% dos casos).
 * Então o desfecho mais provável é a lista vir vazia. Lista vazia não é
 * erro: vira o aviso "histórico anterior não foi importado" na conversa.
 */

export type MensagemDoHistorico = {
  providerMessageId: string;
  fromMe: boolean;
  tipo: "texto" | "audio" | "imagem" | "documento";
  /** Texto pronto para gravar; nulo no áudio, que precisa de transcrição. */
  texto: string | null;
  /** Quando a mensagem foi trocada (ISO). */
  em: string;
  /** `key` + `message` como vieram: é o que decifra o áudio na Evolution. */
  bruto: { key: unknown; message: unknown };
};

/** Quantas mensagens trazer, no máximo, e de quantos dias para trás. */
export const LIMITE_DO_HISTORICO = 50;
export const DIAS_DO_HISTORICO = 30;

type Obj = Record<string, unknown>;

function ehObjeto(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textoDe(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Os registros, em qualquer um dos formatos que a Evolution já devolveu. */
function registros(resposta: unknown): unknown[] {
  if (Array.isArray(resposta)) return resposta;
  if (!ehObjeto(resposta)) return [];
  if (Array.isArray(resposta.records)) return resposta.records;
  if (ehObjeto(resposta.messages)) {
    const m = resposta.messages;
    if (Array.isArray(m.records)) return m.records;
  }
  if (Array.isArray(resposta.messages)) return resposta.messages;
  return [];
}

function instante(v: unknown): string | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
  if (Number.isFinite(n) && n > 0) {
    // Segundos (o padrão do WhatsApp) ou milissegundos.
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function lerUma(registro: unknown): MensagemDoHistorico | null {
  if (!ehObjeto(registro)) return null;
  const key = ehObjeto(registro.key) ? registro.key : null;
  const message = ehObjeto(registro.message) ? registro.message : null;
  const id = textoDe(key?.id);
  if (!key || !message || !id) return null;

  const em = instante(registro.messageTimestamp);
  if (!em) return null;

  const fromMe = key.fromMe === true;
  const base = { providerMessageId: id, fromMe, em, bruto: { key, message } };
  const quem = fromMe ? "corretor" : "cliente";

  const texto =
    textoDe(message.conversation) ??
    (ehObjeto(message.extendedTextMessage) ? textoDe(message.extendedTextMessage.text) : null);
  if (texto) return { ...base, tipo: "texto", texto };

  if (ehObjeto(message.audioMessage)) return { ...base, tipo: "audio", texto: null };

  if (ehObjeto(message.imageMessage)) {
    const legenda = textoDe(message.imageMessage.caption);
    return {
      ...base,
      tipo: "imagem",
      texto: `[${quem} enviou uma imagem${legenda ? `: "${legenda}"` : ""}]`,
    };
  }
  if (ehObjeto(message.documentMessage)) {
    const nome = textoDe(message.documentMessage.fileName);
    return {
      ...base,
      tipo: "documento",
      texto: `[${quem} enviou um documento${nome ? `: "${nome}"` : ""}]`,
    };
  }
  // Figurinha, reação, enquete, chamada: nada que ajude a IA a entender o cliente.
  return null;
}

/**
 * As mensagens do histórico, da mais antiga para a mais recente, dentro da
 * janela de dias e do teto, sem a mensagem que acabou de chegar (ela segue o
 * caminho normal do webhook e seria gravada duas vezes).
 */
export function lerHistoricoDoChat(
  resposta: unknown,
  opcoes: { excluirId?: string | null; agora?: Date } = {},
): MensagemDoHistorico[] {
  const agora = opcoes.agora ?? new Date();
  const desde = agora.getTime() - DIAS_DO_HISTORICO * 24 * 3600_000;
  const vistas = new Set<string>();

  return registros(resposta)
    .map(lerUma)
    .filter((m): m is MensagemDoHistorico => m !== null)
    .filter((m) => m.providerMessageId !== opcoes.excluirId)
    .filter((m) => new Date(m.em).getTime() >= desde)
    .filter((m) => (vistas.has(m.providerMessageId) ? false : (vistas.add(m.providerMessageId), true)))
    .sort((a, b) => a.em.localeCompare(b.em))
    .slice(-LIMITE_DO_HISTORICO);
}

/**
 * A mídia que chega ao número central (onda 2, Frente I): foto de documento
 * e planilha de clientes. Puro: sem rede nem banco.
 *
 * Duas regras atravessam tudo aqui:
 *
 * - O ARQUIVO nunca vai a histórico, proposta guardada ou registro. A foto
 *   que vira anexo do lead é baixada de novo no "sim", pela REFERÊNCIA da
 *   mensagem do WhatsApp (as chaves da mídia, sem o conteúdo nem a
 *   miniatura); a planilha é lida na hora e só as linhas já lidas seguem.
 * - O tipo vem dos BYTES (e do nome, quando os bytes não bastam, como no
 *   CSV), nunca só do rótulo do provedor: sem `mimetype`,
 *   `baixarMidiaDoProvedor` responde "audio/ogg".
 */

/**
 * Como baixar de novo a mídia de uma mensagem: a chave dela e o pedaço da
 * mensagem que a Evolution precisa para decifrar (`url`, `directPath`,
 * `mediaKey`…). Sem `jpegThumbnail` (é um pedaço da própria foto) e sem
 * legenda. Vive no histórico da conversa (30 min) e na proposta (1 h), que é
 * o tempo de a pessoa dizer de quem é o documento e confirmar; NUNCA no
 * registro do comando (`paraORegistro` em `conversa.ts`).
 */
export type ReferenciaDaMidia = {
  id: string;
  remoteJid: string;
  tipo: "imageMessage" | "documentMessage";
  conteudo: Record<string, string | number>;
};

/** Os campos da mídia que servem para baixar de novo; o resto (miniatura, legenda, contexto) fica de fora. */
const CAMPOS_DA_REFERENCIA = [
  "url",
  "directPath",
  "mediaKey",
  "mediaKeyTimestamp",
  "mimetype",
  "fileSha256",
  "fileEncSha256",
  "fileLength",
  "fileName",
] as const;

type Payload = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** O documento da mensagem, com ou sem legenda (a Evolution embrulha o com legenda). */
export function documentoDaMensagem(m: Payload): Payload | null {
  return m?.documentMessage ?? m?.documentWithCaptionMessage?.message?.documentMessage ?? null;
}

/** A referência da foto ou do arquivo desta mensagem do webhook, ou `null` quando não há mídia. */
export function referenciaDaMensagem(data: Payload): ReferenciaDaMidia | null {
  const key = data?.key ?? {};
  const m = data?.message ?? {};
  const tipo = m.imageMessage ? "imageMessage" : documentoDaMensagem(m) ? "documentMessage" : null;
  if (!tipo || typeof key.id !== "string" || typeof key.remoteJid !== "string") return null;
  const origem: Payload = tipo === "imageMessage" ? m.imageMessage : documentoDaMensagem(m)!;
  const conteudo: Record<string, string | number> = {};
  for (const campo of CAMPOS_DA_REFERENCIA) {
    const v = origem?.[campo];
    if (typeof v === "string" || typeof v === "number") conteudo[campo] = v;
    // `fileLength` às vezes chega como Long do protobuf ({ low, high }).
    else if (v && typeof v === "object" && typeof v.low === "number") conteudo[campo] = v.low;
  }
  if (!conteudo.mediaKey || !(conteudo.url || conteudo.directPath)) return null;
  return { id: key.id, remoteJid: key.remoteJid, tipo, conteudo };
}

/** A mensagem que `baixarMidiaDoProvedor` recebe como `mensagemCompleta`, montada pela referência. */
export function mensagemDaReferencia(r: ReferenciaDaMidia): { key: unknown; message: unknown } {
  return { key: { id: r.id, remoteJid: r.remoteJid, fromMe: false }, message: { [r.tipo]: r.conteudo } };
}

export function ehReferencia(v: unknown): v is ReferenciaDaMidia {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.remoteJid === "string" &&
    (r.tipo === "imageMessage" || r.tipo === "documentMessage") &&
    Boolean(r.conteudo) &&
    typeof r.conteudo === "object"
  );
}

export type TipoDeImagem = "image/jpeg" | "image/png" | "image/webp";

/**
 * O tipo pelos primeiros bytes, não pelo que o provedor diz: sem `mimetype`,
 * `baixarMidiaDoProvedor` responde "audio/ogg" (o padrão do áudio), e um GIF
 * ou HEIC rotulado de imagem a OpenAI recusa com 400, que viraria "estou
 * indisponível".
 */
export function tipoDaImagem(base64: string): TipoDeImagem | null {
  const b = Buffer.from(base64.slice(0, 24), "base64");
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function bytesDoBase64(base64: string): number {
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
}

// ── Planilha ────────────────────────────────────────────────────────────────

/**
 * Teto da planilha (bytes decodificados). A importação do painel aceita 10
 * MB porque lá cabem PDF e conversa exportada; uma lista de 300 contatos
 * (o teto por importação) em .xlsx ou CSV não chega a 1 MB, e o arquivo
 * inteiro passa pela memória da função do webhook.
 */
export const TAMANHO_MAXIMO_DA_PLANILHA = 5 * 1024 * 1024;

/** O que o arquivo diz ser, pelo nome ou pelo rótulo: só decide se vale BAIXAR. */
export function pareceUmaPlanilha(arquivo: { nome: string | null; mimeType: string | null } | undefined): boolean {
  if (!arquivo) return false;
  const nome = (arquivo.nome ?? "").toLowerCase();
  const mime = (arquivo.mimeType ?? "").toLowerCase().split(";")[0].trim();
  if (/\.(xlsx|xls|csv)$/.test(nome)) return true;
  return [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
    "application/csv",
    "text/comma-separated-values",
  ].includes(mime);
}

export type FormatoDaPlanilha = "xlsx" | "csv" | "xls_antigo" | null;

/**
 * O formato pelos BYTES: .xlsx é um zip ("PK\x03\x04"), o .xls antigo é um
 * documento OLE (D0 CF 11 E0), que o leitor do painel também recusa. CSV não
 * tem assinatura: vale quando o nome ou o rótulo dizem CSV E o começo do
 * arquivo é texto (sem byte nulo). Um PDF renomeado para .csv cai fora.
 */
export function formatoDaPlanilha(base64: string, arquivo: { nome: string | null; mimeType: string | null }): FormatoDaPlanilha {
  const b = Buffer.from(base64.slice(0, 1400), "base64");
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return "xlsx";
  if (b.length >= 4 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return "xls_antigo";
  const nome = (arquivo.nome ?? "").toLowerCase();
  const mime = (arquivo.mimeType ?? "").toLowerCase();
  const dizCsv = nome.endsWith(".csv") || /csv|comma-separated/.test(mime);
  if (dizCsv && b.length > 0 && !b.includes(0x00) && !b.subarray(0, 5).equals(Buffer.from("%PDF-"))) return "csv";
  return null;
}

/**
 * O que o tratador recebe junto do contexto (`ContextoDoCentral.midia`), só
 * durante a mensagem:
 *
 * - `foto`: a foto desta mensagem ou a última da conversa (30 min), pela
 *   referência; `dica` é a legenda e o texto da mensagem, para achar QUAL
 *   documento é ("o RG do João");
 * - `planilha`: o arquivo inteiro, já conferido (tipo e tamanho), que a
 *   importação lê na hora e não guarda.
 */
export type MidiaDoPedido =
  | { tipo: "foto"; referencia: ReferenciaDaMidia; dica: string }
  | { tipo: "planilha"; nome: string; formato: "xlsx" | "csv"; base64: string };

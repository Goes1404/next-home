import "server-only";

/**
 * Transcrição de áudio pela Groq (Whisper large v3).
 *
 * Existe para tirar o áudio do último ponto único de falha da IA. Todo o
 * caminho de TEXTO já é uma cascata de três provedores desde agosto/2026,
 * mas a mensagem de voz continuava dependendo só do Gemini: com ele fora do
 * ar, o áudio do cliente virava "[não foi possível transcrever]" e o
 * corretor tinha que ouvir na mão.
 *
 * Por que não entra em `llm.ts`: aquela cascata negocia JSON de texto, e
 * aqui o contrato é outro — `multipart/form-data` com o arquivo de áudio,
 * resposta em texto puro. Forçar os dois no mesmo tipo faria o adaptador
 * mentir sobre o que sabe fazer.
 *
 * O Gemini continua sendo o PRIMEIRO do áudio, e de propósito: além de
 * transcrever, ele devolve a intenção resumida na mesma chamada (o Whisper
 * só transcreve). Esta é a rede embaixo, não a substituição.
 */

const BASE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export const MODELO_AUDIO_GROQ = "whisper-large-v3-turbo";

export function groqAudioConfigurado(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export type ResultadoTranscricaoGroq =
  | { ok: true; texto: string }
  | { ok: false; erro: string };

/**
 * `dadosBase64` é o áudio já decodificado do caminho do WhatsApp — o mesmo
 * buffer que iria para o Gemini, sem baixar de novo.
 */
export async function transcreverComGroq(
  dadosBase64: string,
  mimeType: string,
  timeoutMs = 15_000,
): Promise<ResultadoTranscricaoGroq> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return { ok: false, erro: "sem_api_key" };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // A extensão importa: a Groq rejeita o upload sem um nome de arquivo
    // reconhecível, mesmo com o mimeType correto no Blob.
    const extensao = mimeType.includes("mpeg")
      ? "mp3"
      : mimeType.includes("wav")
        ? "wav"
        : mimeType.includes("mp4") || mimeType.includes("m4a")
          ? "m4a"
          : "ogg";

    const form = new FormData();
    form.append("file", new Blob([Buffer.from(dadosBase64, "base64")], { type: mimeType }), `audio.${extensao}`);
    form.append("model", process.env.GROQ_AUDIO_MODEL || MODELO_AUDIO_GROQ);
    /*
     * `verbose_json` traz, por trecho, a probabilidade de NÃO haver fala.
     * O Whisper escreve texto até sobre silêncio ("Legendas pela comunidade
     * Amara.org"): trecho que ele mesmo acha que não tem fala sai fora.
     */
    form.append("response_format", "verbose_json");
    form.append("temperature", "0");
    // O cliente fala português; sem a dica o Whisper às vezes "traduz" para
    // inglês e o corretor lê no CRM uma fala que ninguém disse.
    form.append("language", "pt");

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const corpo = await res.text().catch(() => "");
      return { ok: false, erro: `http_${res.status}${corpo ? `: ${corpo.slice(0, 150)}` : ""}` };
    }

    const json = (await res.json().catch(() => null)) as Parameters<typeof textoDosTrechos>[0] | null;
    const texto = json ? textoDosTrechos(json) : "";
    if (!texto) return { ok: false, erro: "resposta_vazia" };

    return { ok: true, texto };
  } catch (err) {
    const abortou = err instanceof Error && err.name === "AbortError";
    return { ok: false, erro: abortou ? "timeout" : String(err) };
  }
}

type TrechoWhisper = { text?: string; no_speech_prob?: number; avg_logprob?: number };

/**
 * Junta só os trechos em que o próprio Whisper acredita haver fala. Sem a
 * lista de trechos (formato inesperado), fica o texto inteiro — as travas
 * de `transcricaoAceitavel` continuam valendo depois.
 */
export function textoDosTrechos(resposta: { text?: string; segments?: TrechoWhisper[] }): string {
  const trechos = Array.isArray(resposta.segments) ? resposta.segments : null;
  if (!trechos) return (resposta.text ?? "").trim();
  return trechos
    .filter((t) => (t.no_speech_prob ?? 0) < 0.6 && (t.avg_logprob ?? 0) > -1)
    .map((t) => (t.text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

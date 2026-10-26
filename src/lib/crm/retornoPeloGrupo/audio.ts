import "server-only";

import { transcreverAudioWhatsapp } from "@/lib/whatsapp/audioTranscriber";
import { baixarMidiaDoProvedor } from "@/lib/whatsapp/provider";
import { BUCKET_DO_AUDIO } from "./audioGuardado";
import type { Banco } from "./situacao";

type Obj = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** `data.key` e `data.message` como chegaram: a Evolution decifra o áudio direto com eles. */
function mensagemCompleta(payload: unknown): { key?: unknown; message?: unknown } | null {
  if (!ehObjeto(payload) || !ehObjeto(payload.data)) return null;
  return { key: payload.data.key, message: payload.data.message };
}

/** Duração declarada do áudio (procura também dentro das mensagens embrulhadas). */
function segundosDoAudio(mensagem: unknown, nivel = 0): number | null {
  if (!ehObjeto(mensagem) || nivel > 3) return null;
  const audio = mensagem.audioMessage;
  if (ehObjeto(audio)) return typeof audio.seconds === "number" ? audio.seconds : null;
  for (const valor of Object.values(mensagem)) {
    if (ehObjeto(valor) && ehObjeto(valor.message)) {
      const s = segundosDoAudio(valor.message, nivel + 1);
      if (s !== null) return s;
    }
  }
  return null;
}

function extensao(mimeType: string): string {
  const tipo = mimeType.split(";")[0].trim().toLowerCase();
  if (tipo === "audio/mpeg" || tipo === "audio/mp3") return "mp3";
  if (tipo === "audio/mp4" || tipo === "audio/m4a" || tipo === "audio/aac") return "m4a";
  if (tipo === "audio/wav" || tipo === "audio/x-wav") return "wav";
  if (tipo === "audio/webm") return "webm";
  return "ogg";
}

export type AudioDoRelato =
  | { ok: true; texto: string | null; audioPath: string | null }
  | { ok: false; audioPath: string | null };

/**
 * Baixa o áudio do relato, guarda no Storage e (se `transcrever`) transcreve.
 *
 * O áudio vai para `<grupo>/<mensagem>.<ext>`: na hora de guardar ainda não
 * se sabe de qual lead ele é (pode virar pergunta). Falha ao guardar não
 * impede a transcrição; falha ao baixar ou transcrever, sim (`ok: false`).
 *
 * Mesmo na falha da transcrição o caminho volta: quem chama grava em
 * `retornos_de_ligacao.audio_path`, e é por essa coluna que a exclusão (LGPD)
 * acha todo áudio guardado. Nenhum arquivo fica sem linha que aponte para ele.
 */
export async function lerAudioDoRelato(p: {
  supabase: Banco;
  grupoId: string;
  instanceName: string;
  mensagemId: string;
  payload: unknown;
  transcrever: boolean;
}): Promise<AudioDoRelato> {
  const completa = mensagemCompleta(p.payload);
  const midia = await baixarMidiaDoProvedor({
    instanceName: p.instanceName,
    messageId: p.mensagemId,
    mensagemCompleta: completa,
  });
  if (!midia.ok) {
    console.warn(`[retorno] áudio ${p.mensagemId} não baixou: ${midia.motivo}`);
    return { ok: false, audioPath: null };
  }

  let audioPath: string | null = `${p.grupoId}/${p.mensagemId}.${extensao(midia.mimeType)}`;
  try {
    const { error } = await p.supabase.storage
      .from(BUCKET_DO_AUDIO)
      .upload(audioPath, Buffer.from(midia.base64, "base64"), {
        contentType: midia.mimeType.split(";")[0].trim() || "audio/ogg",
        upsert: true,
      });
    if (error) throw new Error(error.message);
  } catch (erro) {
    console.error(`[retorno] áudio ${p.mensagemId} não foi guardado:`, erro);
    audioPath = null;
  }

  if (!p.transcrever) return { ok: true, texto: null, audioPath };

  const transcricao = await transcreverAudioWhatsapp({
    base64: midia.base64,
    mimeType: midia.mimeType,
    segundos: segundosDoAudio(completa?.message),
  });
  const texto = transcricao.sucesso ? transcricao.textoTranscrito.trim() : "";
  if (!texto) return { ok: false, audioPath };
  return { ok: true, texto, audioPath };
}

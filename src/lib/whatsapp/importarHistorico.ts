import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { transcreverAudioWhatsapp } from "./audioTranscriber";
import { LIMITE_DO_HISTORICO, lerHistoricoDoChat } from "./historicoDoChat";
import { baixarMidiaDoProvedor, buscarMensagensDoChat } from "./provider";

/** Áudios transcritos por importação: cada um custa uma chamada e alguns segundos do webhook. */
const AUDIOS_TRANSCRITOS = 5;

/**
 * Traz para a conversa o que já foi falado ANTES de a palavra-chave
 * cadastrar o número (0146).
 *
 * Grava as mensagens com a data original, transcreve os áudios mais
 * recentes e carimba o desfecho em `historico_anterior`, que é o que faz a
 * conversa avisar o corretor quando não houve o que trazer. Nunca lança: o
 * cadastro e a liberação já aconteceram, e histórico é contexto a mais.
 *
 * Devolve quantas mensagens entraram (0 quando não foi possível).
 */
export async function importarHistoricoDoChat(params: {
  instanceName: string;
  conversaId: string;
  remoteJid: string;
  /** A mensagem que acionou a importação: ela segue o caminho normal. */
  mensagemAtualId: string | null;
}): Promise<number> {
  const supabase = createServiceClient();
  const marcar = async (desfecho: "importado" | "indisponivel") => {
    const { error } = await supabase
      .from("whatsapp_conversas")
      .update({ historico_anterior: desfecho })
      .eq("id", params.conversaId);
    if (error) console.error("[histórico] falha ao marcar o desfecho:", error.message);
  };

  try {
    const busca = await buscarMensagensDoChat({
      instanceName: params.instanceName,
      remoteJid: params.remoteJid,
      // Pede uma folga: mensagens fora da janela de dias e tipos ignorados
      // (figurinha, reação) saem na leitura.
      limite: LIMITE_DO_HISTORICO * 2,
    });
    if (!busca.ok) {
      console.warn("[histórico] a Evolution não devolveu o chat:", busca.detalhe);
      await marcar("indisponivel");
      return 0;
    }

    const mensagens = lerHistoricoDoChat(busca.resposta, { excluirId: params.mensagemAtualId });
    if (mensagens.length === 0) {
      await marcar("indisponivel");
      return 0;
    }

    const audiosParaTranscrever = new Set(
      mensagens
        .filter((m) => m.tipo === "audio")
        .slice(-AUDIOS_TRANSCRITOS)
        .map((m) => m.providerMessageId),
    );

    let gravadas = 0;
    for (const m of mensagens) {
      let conteudo = m.texto;
      if (m.tipo === "audio") {
        conteudo = "[áudio anterior à ativação, não transcrito]";
        if (audiosParaTranscrever.has(m.providerMessageId)) {
          const baixado = await baixarMidiaDoProvedor({
            instanceName: params.instanceName,
            messageId: m.providerMessageId,
            mensagemCompleta: m.bruto,
          });
          if (baixado.ok) {
            const r = await transcreverAudioWhatsapp({ base64: baixado.base64, mimeType: baixado.mimeType });
            if (r.sucesso && r.textoTranscrito) conteudo = r.textoTranscrito;
          }
        }
      }
      if (!conteudo) continue;

      const { error } = await supabase.from("whatsapp_mensagens").insert({
        conversa_id: params.conversaId,
        remetente: m.fromMe ? "corretor" : "cliente",
        tipo: m.tipo,
        conteudo,
        provider_message_id: m.providerMessageId,
        created_at: m.em,
      });
      // 23505: a mensagem já estava na conversa.
      if (error && error.code !== "23505") {
        console.error("[histórico] falha ao gravar mensagem:", error.message);
        continue;
      }
      if (!error) gravadas++;
    }

    await marcar(gravadas > 0 ? "importado" : "indisponivel");
    return gravadas;
  } catch (erro) {
    console.error("[histórico] falha ao importar:", erro);
    await marcar("indisponivel");
    return 0;
  }
}

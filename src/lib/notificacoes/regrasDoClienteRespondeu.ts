import type { MotivoDoSilencio } from "@/lib/whatsapp/quandoAIaResponde";
import { nomeNaNotificacao } from "@/lib/notificacoes/nomeNaNotificacao";

/**
 * As regras puras da notificação "cliente respondeu" (29/10/2026).
 */

/** Uma notificação por lead a cada 15 min: uma rajada de mensagens toca uma vez. */
export const CARENCIA_CLIENTE_RESPONDEU_MIN = 15;

/**
 * Os silêncios da IA em que a conversa ESTÁ COM O CORRETOR: ninguém vai
 * responder se ele não souber. Ficam de fora:
 *
 * - `lead_de_outro_corretor`: o dono é outro, avisado no grupo dele (spec 6.8);
 * - `lead_pediu_para_sair`: a fala é tratada pelo detector de recusa;
 * - `corretor_respondendo`: o co-piloto calou porque o corretor falou há
 *   menos de 3 min — ele está dentro da conversa, e a notificação seria eco.
 */
export const SILENCIOS_QUE_CHAMAM_O_CORRETOR: readonly MotivoDoSilencio[] = [
  "ia_desligada_na_conversa",
  "ia_desligada_no_numero",
  "dentro_do_expediente",
  "cota_do_grupo",
  "grupo_suspenso",
];

/**
 * Esta fala do cliente vira notificação?
 *
 * Lead que acabou de nascer não: o aviso de lead novo (0203) já sai para ele,
 * e as duas tocariam juntas. Conversa de teste também não.
 */
export function deveAvisarClienteRespondeu(p: {
  motivoDoSilencio: MotivoDoSilencio;
  eTeste: boolean;
  leadCriadoAgora: boolean;
}): boolean {
  if (p.eTeste || p.leadCriadoAgora) return false;
  return SILENCIOS_QUE_CHAMAM_O_CORRETOR.includes(p.motivoDoSilencio);
}

/** A carência do lead já venceu? Sem aviso anterior, sim. */
export function carenciaDoClienteRespondeuVencida(ultimoAviso: string | Date | null, agora: Date): boolean {
  if (!ultimoAviso) return true;
  const t = (ultimoAviso instanceof Date ? ultimoAviso : new Date(ultimoAviso)).getTime();
  if (Number.isNaN(t)) return true;
  return agora.getTime() - t >= CARENCIA_CLIENTE_RESPONDEU_MIN * 60_000;
}

const ROTULO_DA_MIDIA: Record<string, string> = {
  audio: "Mandou um áudio.",
  imagem: "Mandou uma foto.",
  image: "Mandou uma foto.",
  video: "Mandou um vídeo.",
  documento: "Mandou um documento.",
  document: "Mandou um documento.",
};

/**
 * Título com quem escreveu; corpo com o começo da mensagem (como o próprio
 * WhatsApp mostra). Mídia vira uma frase, nunca o endereço do arquivo.
 */
export function notificacaoDoClienteRespondeu(p: {
  lead: { nome: string | null; telefone: string | null };
  texto: string | null;
  tipo: string | null;
}): { titulo: string; corpo: string } {
  const titulo = `${nomeNaNotificacao(p.lead)} respondeu`;
  const texto = (p.texto ?? "").replace(/\s+/g, " ").trim();
  const midia = p.tipo && p.tipo !== "texto" ? ROTULO_DA_MIDIA[p.tipo] : undefined;
  // Na mídia o `texto` é a anotação interna ("[cliente enviou uma imagem…]")
  // ou a transcrição do áudio: na tela de bloqueio, só a frase.
  if (midia) return { titulo, corpo: midia };
  if (!texto) return { titulo, corpo: "Mandou uma mensagem no WhatsApp." };
  return { titulo, corpo: texto.length > 140 ? `${texto.slice(0, 139)}…` : texto };
}

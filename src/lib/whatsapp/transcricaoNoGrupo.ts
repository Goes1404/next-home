// Transcrição de TODO áudio do cliente, com teto diário por grupo
// (IA no atendimento, 30/10/2026).
//
// O que já existia: o webhook transcrevia o áudio ANTES de gravar a mensagem,
// com a IA ligada ou não, sem teto nenhum — e a reentrega do provedor (que
// chega ANTES da guarda de reentrega) pagava a mesma transcrição de novo.
// Uma transcrição lenta (três motores de 15 s cada) segurava a gravação da
// fala.
//
// O que mudou:
//   1. a fala do cliente é GRAVADA PRIMEIRO, com o marcador
//      `AUDIO_TRANSCREVENDO`; a transcrição vem depois e troca o conteúdo da
//      linha (só se o marcador ainda estiver lá: idempotente);
//   2. reentrega bate na guarda de `provider_message_id` antes de qualquer
//      transcrição — o mesmo áudio nunca é pago duas vezes;
//   3. com a IA calada na conversa (ou na fala do próprio corretor), a
//      transcrição respeita um teto diário por grupo. Com a IA atendendo, ela
//      é parte da resposta e não passa pelo teto (a cota mensal de respostas
//      já segura o grupo).
//
// Módulo PURO: as decisões e os textos. A leitura do uso do dia mora em
// `usoDaIa.ts`; a gravação, no repositório.

import type { Plano } from "@/lib/plataforma/rotulosDoGrupo";

/** O conteúdo da linha enquanto a transcrição não chega. */
export const AUDIO_TRANSCREVENDO = "[Áudio recebido — transcrevendo…]";
/** O conteúdo quando o teto do dia do grupo segurou a transcrição. */
export const AUDIO_SEM_TRANSCRICAO_PELO_TETO =
  "[Áudio recebido — transcrição automática pausada: o limite diário de transcrições da conta foi atingido. Ouça no WhatsApp.]";

/** O conteúdo quando o grupo está suspenso (cobrança) e a IA não atende. */
export const AUDIO_SEM_TRANSCRICAO =
  "[Áudio recebido — transcrição automática indisponível nesta conta. Ouça no WhatsApp.]";

/** O texto que fica no lugar da transcrição que não foi feita. */
export function textoDoAudioNaoTranscrito(decisao: Exclude<DecisaoDaTranscricao, "transcrever">): string {
  return decisao === "teto_do_dia" ? AUDIO_SEM_TRANSCRICAO_PELO_TETO : AUDIO_SEM_TRANSCRICAO;
}

/**
 * Transcrições por dia, por plano. `null` = sem teto (o plano a preço de
 * custo). Imobiliária é por assento, como a cota de respostas.
 *
 * NÚMERO PROVISÓRIO (30/10/2026): a US$ 0,003/min (gpt-4o-mini-transcribe),
 * 100 áudios de 40 s por dia são ~R$ 0,11/dia — o teto existe para o caso
 * patológico (número em grupo de áudio, loop de mídia), não para racionar.
 */
export const TRANSCRICOES_POR_DIA: Record<Plano, number | null> = {
  essencial: 100,
  profissional: 200,
  imobiliaria: 100,
  custo: null,
};

/** O teto do dia do grupo; `null` = sem teto. */
export function tetoDeTranscricoesDoDia(p: { plano: Plano | string | null; assentos: number }): number | null {
  const plano = (p.plano ?? "essencial") as Plano;
  const base = plano in TRANSCRICOES_POR_DIA ? TRANSCRICOES_POR_DIA[plano] : TRANSCRICOES_POR_DIA.essencial;
  if (base === null) return null;
  return plano === "imobiliaria" ? base * Math.max(1, p.assentos) : base;
}

export type DecisaoDaTranscricao = "transcrever" | "teto_do_dia" | "grupo_suspenso";

/**
 * Transcreve este áudio?
 *
 * - IA atendendo a conversa: sempre (a resposta depende do texto).
 * - IA calada (ou fala do corretor): só com o grupo em dia e abaixo do teto.
 *   Falha na leitura do uso chega aqui como `transcricoesHoje: 0` — a mesma
 *   régua da cota (`usoDaIa.ts`): "não sei" custa centavos, nunca a fala.
 */
export function decidirTranscricao(p: {
  iaAtende: boolean;
  transcricoesHoje: number;
  teto: number | null;
  grupoSuspenso: boolean;
}): DecisaoDaTranscricao {
  if (p.iaAtende) return "transcrever";
  if (p.grupoSuspenso) return "grupo_suspenso";
  if (p.teto !== null && p.transcricoesHoje >= p.teto) return "teto_do_dia";
  return "transcrever";
}

/** O conteúdo da linha é um marcador de áudio (nada que o cliente disse)? */
export function ehMarcadorDeAudio(conteudo: string | null | undefined): boolean {
  return typeof conteudo === "string" && /^\[Áudio recebido\b/.test(conteudo.trim());
}

/** São Paulo não tem horário de verão desde 2019: o deslocamento é fixo. */
const DESLOCAMENTO_SP_MS = 3 * 3_600_000;

/** Meia-noite de hoje em São Paulo, como instante (o "dia" do teto). */
export function inicioDoDiaEmSaoPaulo(agora: Date = new Date()): Date {
  const local = new Date(agora.getTime() - DESLOCAMENTO_SP_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + DESLOCAMENTO_SP_MS);
}

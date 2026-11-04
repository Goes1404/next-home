// O funil da prospecção (0253, 02/11/2026). Módulo PURO: ordena a lista e
// diz qual é a próxima ação de cada loja, a partir das colunas da linha.

import type { Etapa } from "./tipos";

export type LinhaDoFunil = {
  etapa: string;
  nao_contatar: boolean;
  enviado_em: string | null;
  ultima_visita_em: string | null;
  visitas: number;
  updated_at: string;
  /** Quando o follow-up saiu (0256); ausente nas leituras antigas. */
  followup_em?: string | null;
};

export type Temperatura = "quente" | "morna" | "fria" | "parada";

const DIA = 86_400_000;

/**
 * Quente: foi abordada e abriu a amostra nos últimos 3 dias sem responder.
 * É o melhor momento do follow-up. Morna: abriu há mais tempo. Fria:
 * abordada e nunca abriu. Parada: o resto (não abordada, já respondeu,
 * encerrada).
 */
export function temperatura(l: LinhaDoFunil, agora: Date = new Date()): Temperatura {
  if (l.nao_contatar || l.etapa !== "enviado") return "parada";
  if (!l.ultima_visita_em) return "fria";
  return agora.getTime() - new Date(l.ultima_visita_em).getTime() <= 3 * DIA ? "quente" : "morna";
}

function diasDesde(iso: string | null | undefined, agora: Date): number {
  return iso ? Math.floor((agora.getTime() - new Date(iso).getTime()) / DIA) : 0;
}

/**
 * A régua da abordagem (0256, 04/11/2026): um follow-up só, no 3º dia sem
 * resposta, ou antes disso se a loja abriu a amostra (já com 1 dia de envio).
 */
export function followupDevido(l: LinhaDoFunil, agora: Date = new Date()): boolean {
  if (l.nao_contatar || l.etapa !== "enviado" || l.followup_em || !l.enviado_em) return false;
  const dias = diasDesde(l.enviado_em, agora);
  return dias >= 3 || (temperatura(l, agora) === "quente" && dias >= 1);
}

/**
 * Sem resposta: o follow-up saiu há 4 dias ou mais e a loja não abriu a
 * amostra nos últimos 3. A rotina diária encerra como "perdido".
 */
export function semResposta(l: LinhaDoFunil, agora: Date = new Date()): boolean {
  if (l.nao_contatar || l.etapa !== "enviado" || !l.followup_em) return false;
  return diasDesde(l.followup_em, agora) >= 4 && temperatura(l, agora) !== "quente";
}

/** A próxima ação, em uma frase, para a lista. */
export function proximaAcao(l: LinhaDoFunil, agora: Date = new Date()): string {
  if (l.nao_contatar) return "Não contatar";
  const etapa = l.etapa as Etapa;
  const t = temperatura(l, agora);
  if (l.etapa === "enviado" && l.followup_em) {
    if (t === "quente") return "Abriu depois do follow-up: vale chamar";
    return semResposta(l, agora) ? "Sem resposta: encerrar" : "Follow-up enviado: aguardando";
  }
  if (followupDevido(l, agora)) {
    return t === "fria" ? "Não abriu: mandar o follow-up" : "Abriu a amostra: bom momento para o follow-up";
  }
  if (t === "quente") return "Abriu a amostra: dar um dia antes do follow-up";
  if (t === "morna") return "Abriu a amostra há alguns dias";
  if (t === "fria") return "Aguardando abrir a amostra";
  switch (etapa) {
    case "novo":
      return "Revisar e enviar a abordagem";
    case "aprovado":
      return "Pronto para enviar";
    case "respondeu":
      return "Respondeu: marcar a reunião";
    case "reuniao":
      return "Reunião marcada";
    case "proposta":
      return "Acompanhar a proposta";
    case "ganho":
      return "Cliente";
    case "perdido":
      return "Encerrado";
    default:
      return "";
  }
}

const PESO: Record<Temperatura, number> = { quente: 0, fria: 2, morna: 1, parada: 3 };

/** Quentes primeiro; dentro de cada grupo, a mudança mais recente. */
export function ordenarParaOFunil<T extends LinhaDoFunil>(linhas: T[], agora: Date = new Date()): T[] {
  return [...linhas].sort((a, b) => {
    const p = PESO[temperatura(a, agora)] - PESO[temperatura(b, agora)];
    if (p !== 0) return p;
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

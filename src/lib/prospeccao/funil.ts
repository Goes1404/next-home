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

/** A próxima ação, em uma frase, para a lista. */
export function proximaAcao(l: LinhaDoFunil, agora: Date = new Date()): string {
  if (l.nao_contatar) return "Não contatar";
  const etapa = l.etapa as Etapa;
  const t = temperatura(l, agora);
  if (t === "quente") return "Abriu a amostra: bom momento para o follow-up";
  if (t === "morna") return "Abriu a amostra há alguns dias";
  if (t === "fria") {
    const dias = l.enviado_em ? Math.floor((agora.getTime() - new Date(l.enviado_em).getTime()) / DIA) : 0;
    return dias >= 3 ? "Não abriu: mandar o follow-up" : "Aguardando abrir a amostra";
  }
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

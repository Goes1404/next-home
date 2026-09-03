/**
 * Tipos e constantes da fila de vídeo — módulo PURO, sem `server-only`.
 *
 * A tela é `"use client"` e precisa dos rótulos de estado. Tipo é apagado na
 * compilação e viaja de graça; CONSTANTE é valor, e importá-la de `fila.ts`
 * arrastaria o cliente do Supabase para o grafo do navegador. Mesma pedra de
 * `imagensTipos.ts`, `pessoasTipos.ts` e `limitesPdf.ts`.
 */

export type StatusJob = "pendente" | "renderizando" | "pronto" | "erro" | "cancelado";

/** O que o corretor lê na tela. Vocabulário de gente, não de fila. */
export const ROTULO_STATUS: Record<StatusJob, string> = {
  pendente: "Na fila",
  renderizando: "Montando o vídeo",
  pronto: "Pronto",
  erro: "Não deu certo",
  cancelado: "Cancelado",
};

/**
 * Quanto tempo um worker segura um job antes de a vaga voltar para a fila.
 *
 * Precisa ser maior que o pior render medido (174 s em 4 CPUs) com folga, e
 * pequeno o bastante para um worker que morreu não travar a fila por horas.
 */
export const TRAVA_MINUTOS = 15;

/** Quantas vezes um job volta para a fila antes de virar erro definitivo. */
export const MAX_TENTATIVAS = 3;

export type VideoJob = {
  id: string;
  status: StatusJob;
  empreendimentoNome: string | null;
  objetivo: string | null;
  canal: string | null;
  titulo: string | null;
  url: string | null;
  duracaoS: number | null;
  erroMotivo: string | null;
  criadoEm: string;
};

/** O que a tela precisa para dizer quantos vídeos ainda cabem. */
export type SaldoDeVideo = {
  cotaMensal: number;
  usadosNoCiclo: number;
  creditosAvulsos: number;
  /** Quantos ainda dá para gerar agora, somando cota restante e avulso. */
  disponiveis: number;
};

export function saldoDisponivel(s: Omit<SaldoDeVideo, "disponiveis">): number {
  return Math.max(0, s.cotaMensal - s.usadosNoCiclo) + s.creditosAvulsos;
}

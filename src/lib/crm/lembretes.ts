/**
 * Lembretes das anotações — a parte PURA (0100).
 *
 * Módulo sem I/O de propósito, como `metricasConversa.ts`: a formatação da
 * mensagem e o recorte vencido/hoje são testáveis sem banco e sem rede. O
 * envio mora no runner (`/api/cron/followups`, passo `processarLembretes`) e
 * a fila do Início lê daqui o rótulo — um texto só para os dois lugares.
 *
 * Spec: docs/superpowers/specs/2026-09-06-anotacoes-do-corretor-design.md
 */

export type SituacaoLembrete = "vencido" | "hoje" | "futuro";

const diaSP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const horaSP = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Vencido é por HORA (o lembrete tem hora marcada e ela passou); "hoje" é o
 * que ainda vem no dia — comparado por DIA de São Paulo, a mesma armadilha de
 * fuso do calendário do bot e do recorte "Hoje" da lista.
 */
export function situacaoDoLembrete(lembreteEm: string, agora: Date): SituacaoLembrete {
  const quando = new Date(lembreteEm);
  if (quando.getTime() <= agora.getTime()) return "vencido";
  return diaSP.format(quando) === diaSP.format(agora) ? "hoje" : "futuro";
}

export function horaDoLembrete(lembreteEm: string): string {
  return horaSP.format(new Date(lembreteEm));
}

/**
 * A mensagem que chega no WhatsApp do próprio corretor.
 *
 * Mesmo contrato do `brokerNotifier`: texto puro (a sintaxe de negrito é a
 * do app, `*asteriscos simples*`), curto, com o lead e quem mandou quando
 * houver. Nada de markdown de modelo — isto é template de código, não IA.
 */
export function formatarLembreteWhatsapp(params: {
  texto: string;
  leadNome?: string | null;
  /** Preenchido quando a nota veio de OUTRO corretor (autor ≠ destinatário). */
  autorNome?: string | null;
}): string {
  const linhas = [`⏰ *Lembrete*`, "", params.texto.trim()];
  const rodape: string[] = [];
  if (params.leadNome) rodape.push(`👤 ${params.leadNome}`);
  if (params.autorNome) rodape.push(`✍️ Anotado por ${params.autorNome}`);
  if (rodape.length > 0) linhas.push("", rodape.join("\n"));
  return linhas.join("\n");
}

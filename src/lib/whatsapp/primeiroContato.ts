/**
 * Primeiro contato pela lista de transmissão (0217, 26/10/2026).
 *
 * "Primeiro contato" é a mensagem para quem nunca escreveu ao corretor. É o
 * que o WhatsApp restringe num número comum: a conta da Bruna em 07/10 e a do
 * Ramos em 21/10 caíram assim, com o espaçamento, a cota e o texto variado
 * todos certos. O Ramos caiu depois de 48 primeiros contatos em dois dias
 * (21 + 27), para uma planilha importada 18 minutos antes, e as 48 levavam
 * o mesmo arquivo de foto.
 *
 * Por isso o primeiro contato tem regras próprias, mais apertadas que a cota
 * do número (que continua valendo para tudo):
 * - no máximo `PRIMEIRO_CONTATO_POR_DIA` por dia e
 *   `PRIMEIRO_CONTATO_POR_SEMANA` em 7 dias;
 * - nenhum nos `DIAS_SEM_PRIMEIRO_CONTATO` dias depois de o número ser
 *   conectado ou de voltar de uma queda: número novo, ou que acabou de ser
 *   desconectado pelo WhatsApp, só fala com quem já conversou com ele;
 * - sem foto nem planta: a mídia vai quando a pessoa responder.
 *
 * Quem já conversou com o corretor continua no ritmo da cota do número.
 * Decisão de 26/10/2026, na linha "bem conservadores" de 09/10: os números
 * só andam para o lado de apertar (`limitesConservadores.test.ts`).
 */

export const PRIMEIRO_CONTATO_POR_DIA = 10;
export const PRIMEIRO_CONTATO_POR_SEMANA = 30;
export const DIAS_SEM_PRIMEIRO_CONTATO = 7;

/** Quantos primeiros contatos ainda cabem agora. */
export function vagasDePrimeiroContato(p: {
  /** Dias inteiros desde a conexão ou a volta da última queda, o que for mais recente. */
  diasDesdeInicio: number;
  enviadosHoje: number;
  enviadosNaSemana: number;
}): number {
  if (!(p.diasDesdeInicio >= DIAS_SEM_PRIMEIRO_CONTATO)) return 0;
  return Math.max(
    0,
    Math.min(PRIMEIRO_CONTATO_POR_DIA - p.enviadosHoje, PRIMEIRO_CONTATO_POR_SEMANA - p.enviadosNaSemana),
  );
}

/** O início da contagem: a conexão ou a volta da queda, o que for mais recente. */
export function inicioDoPrimeiroContato(conectadoEm: Date | null, aquecimentoDesde: Date | null): Date | null {
  if (!conectadoEm) return aquecimentoDesde;
  if (!aquecimentoDesde) return conectadoEm;
  return aquecimentoDesde > conectadoEm ? aquecimentoDesde : conectadoEm;
}

/** Dias inteiros entre `inicio` e `agora` (para baixo). Sem início, zero. */
export function diasDesde(inicio: Date | null, agora: Date = new Date()): number {
  if (!inicio) return 0;
  return Math.floor((agora.getTime() - inicio.getTime()) / 86_400_000);
}

/** O motivo que a tela mostra no item que ficou para depois. */
export function motivoDoPrimeiroContato(p: { diasDesdeInicio: number }): string {
  if (p.diasDesdeInicio < DIAS_SEM_PRIMEIRO_CONTATO) {
    const faltam = DIAS_SEM_PRIMEIRO_CONTATO - Math.max(0, p.diasDesdeInicio);
    return `Esta pessoa nunca falou com você. O número foi conectado (ou voltou de uma queda) há pouco: por ${DIAS_SEM_PRIMEIRO_CONTATO} dias ele só fala com quem já conversou. Faltam ${faltam} dia${faltam === 1 ? "" : "s"}.`;
  }
  return `Esta pessoa nunca falou com você. Primeiro contato é limitado a ${PRIMEIRO_CONTATO_POR_DIA} por dia e ${PRIMEIRO_CONTATO_POR_SEMANA} por semana, para o WhatsApp não restringir o número.`;
}

/**
 * Para quando o item que esperou vaga volta a tentar: amanhã, às 9h de São
 * Paulo, mais `minutos`. `-03:00` fixo: o Brasil não tem horário de verão
 * desde 2019.
 */
export function amanhaCedoEmSaoPaulo(agora: Date, minutos: number): string {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  const [a, m, d] = hoje.split("-").map(Number);
  const amanha = new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
  const base = new Date(`${amanha}T09:00:00-03:00`);
  return new Date(base.getTime() + Math.max(0, minutos) * 60_000).toISOString();
}

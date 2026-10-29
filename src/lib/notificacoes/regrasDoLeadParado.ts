import { nomeNaNotificacao } from "@/lib/notificacoes/nomeNaNotificacao";
import { dentroDoHorarioDosAvisos, horaEMinutoEmSP } from "@/lib/notificacoes/relogio";

/**
 * As regras puras da notificação "lead parado sem contato" (29/10/2026).
 *
 * ## Por que 48h
 *
 * O lead que ninguém respondeu em 30 min já tem aviso próprio (lead pago,
 * 0121), e o que passou de 7 dias já está na fila do Início ("lead parado",
 * `DIAS_PARA_ESFRIAR`) e no resumo de segunda (30+ dias). O buraco entre os
 * dois é onde o lead esfria em silêncio: dois dias sem uma mensagem nossa é
 * o ponto em que o cliente que pediu contato em três lugares já conversa
 * com outro corretor, e ainda dá para recuperar com uma mensagem só. Menos
 * que isso (24h) avisaria o fim de semana inteiro de quem respondeu na
 * sexta; mais (72h) chega tarde.
 *
 * Por isso a janela é de 48h a 7 dias desde o último contato: depois de 7
 * dias o assunto é da fila e do resumo, e avisar todo dia lead de meses
 * atrás viraria barulho que ensina o corretor a ignorar a notificação.
 */

export const HORAS_SEM_CONTATO = 48;
export const DIAS_DA_JANELA = 7;
/**
 * Teto por corretor por dia. Quem herdou uma carteira grande teria dezenas
 * de leads na janela; três por dia é o que se resolve, e a ordem (quem nunca
 * foi avisado primeiro) faz os outros entrarem nos dias seguintes.
 */
export const MAX_PARADOS_POR_CORRETOR_DIA = 3;

/**
 * Este tique varre? Uma vez por hora (o tique de 5 min cujo minuto é < 5),
 * só das 8h às 19h59 de São Paulo. A busca junta mensagens e interações de
 * todos os leads ativos: de hora em hora basta para um aviso diário, e
 * custa 12 consultas por dia em vez de 144.
 */
export function horaDeVarrerLeadsParados(agora: Date): boolean {
  return dentroDoHorarioDosAvisos(agora) && horaEMinutoEmSP(agora).minuto < 5;
}

/**
 * Quem recebe aviso neste tique, respeitando o teto do dia de cada corretor.
 * `candidatos` já vêm na ordem da busca (nunca avisados primeiro, depois o
 * silêncio mais longo).
 */
export function escolherLeadsParados<T extends { corretor_id: string }>(
  candidatos: readonly T[],
  jaAvisadosHoje: ReadonlyMap<string, number>,
  maximo = MAX_PARADOS_POR_CORRETOR_DIA,
): T[] {
  const usados = new Map(jaAvisadosHoje);
  const escolhidos: T[] = [];
  for (const c of candidatos) {
    const n = usados.get(c.corretor_id) ?? 0;
    if (n >= maximo) continue;
    usados.set(c.corretor_id, n + 1);
    escolhidos.push(c);
  }
  return escolhidos;
}

/** "Sem contato há 2 dias". */
export function notificacaoDoLeadParado(p: {
  lead: { nome: string | null; telefone: string | null };
  ultimoContato: string | Date;
  agora: Date;
}): { titulo: string; corpo: string } {
  const desde = p.ultimoContato instanceof Date ? p.ultimoContato : new Date(p.ultimoContato);
  const dias = Math.max(2, Math.floor((p.agora.getTime() - desde.getTime()) / 86_400_000));
  return {
    titulo: `${nomeNaNotificacao(p.lead)} está sem contato`,
    corpo: `Nenhuma mensagem nossa há ${dias} dias. Uma mensagem hoje evita que o lead esfrie.`,
  };
}

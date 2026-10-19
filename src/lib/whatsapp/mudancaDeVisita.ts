import { normalizar } from "./normalizarFala";
import { pedidoDeAgendamento, type PedidoDeAgendamento } from "./pedidoDeAgendamento";

/**
 * O cliente quer REMARCAR ou DESMARCAR a visita que já está marcada
 * (roadmap da nota 10, A2, 06/10/2026).
 *
 * Até aqui a IA só sabia marcar. Com uma visita no CRM, "não vou conseguir
 * sábado, pode ser domingo?" virava `encerrar_confirmado`: ela respondia
 * "qualquer dúvida até lá, me chama" e a data velha ficava no funil. Quem
 * resolvia era o corretor, de cabeça, e o CRM mentia sobre a agenda dele.
 *
 * Função pura, sem LLM, como `pedidoDeAgendamento`. O erro é assimétrico:
 * não perceber custa um turno (o cliente repete, ou o corretor resolve);
 * achar um cancelamento que não houve APAGA uma visita de verdade. Por isso
 * o cancelamento exige frase inequívoca, e qualquer dia ou hora novos na
 * mesma fala transformam o "não vou poder" em remarcação.
 */

export type MudancaDeVisita =
  | { tipo: "remarcar"; dia: string | null; hora: number | null; trecho: string }
  | { tipo: "cancelar"; trecho: string };

/** Pedir para trocar a data, nas palavras de quem pede. */
const REMARCAR =
  /\b(remarca\w*|reagenda\w*|adia\w*|antecipa\w*|(mudar|muda|mude|trocar|troca|troque|alterar|altera|altere) (o |a |de )?(dia|data|horario|hora|visita)|outro (dia|horario)|outra (data|hora)|outro dia|semana que vem)\b/;

/**
 * Desmarcar, sem deixar dúvida. "não vou poder ir" é a forma mais comum, e
 * ela vira remarcação quando vem com outro dia ("não vou poder ir sábado,
 * pode ser domingo?").
 */
const CANCELAR =
  /\b(cancela\w*|desmarca\w*|nao (vou|vai) (mais )?(poder|conseguir|dar pra|da pra) (ir|comparecer|estar|aparecer)|nao (vou|consigo) (mais )?(ir|comparecer) (na|a|nessa|para a|pra) visita|nao consigo mais ir|nao vou mais (ir|na visita)|vou ter que (cancelar|desmarcar))\b/;

/**
 * A contraproposta: "sábado não vou conseguir, pode ser domingo às 11?".
 * Nenhuma palavra de remarcar, e é exatamente isso. Só vale junto de uma
 * data nova diferente da marcada.
 */
const CONTRAPROPOSTA =
  /\b(nao (vou )?(conseguir|consigo|posso|poder|da|vai dar|rola)|pode ser|que tal|e se for|prefiro|melhor)\b/;

/** "não quero cancelar", "não precisa remarcar": o oposto do pedido. */
const NEGA_O_PEDIDO =
  /\bnao (quero|precisa|vou|pretendo|preciso) (cancelar|desmarcar|remarcar|mudar|trocar|reagendar)\b/;

/**
 * Quantas palavras cabem numa resposta de agenda ("domingo 10h", "pode ser
 * terça às 15"). Fala curta com dia ou hora, com visita marcada, é a nova
 * data — fala longa com uma hora no meio ("sábado eu trabalho até as 18h")
 * não é.
 */
const PALAVRAS_DE_UMA_RESPOSTA = 6;

export function detectarMudancaDeVisita(p: {
  texto: string;
  /** A visita marcada no CRM, se houver e se ainda não aconteceu. */
  visitaMarcada: Date | null;
  agendamento: PedidoDeAgendamento;
}): MudancaDeVisita | null {
  if (!p.visitaMarcada) return null;
  const t = normalizar(p.texto).trim();
  if (!t || t.startsWith("[mensagem")) return null;
  if (NEGA_O_PEDIDO.test(t)) return null;

  const pedeRemarcar = t.match(REMARCAR);
  const pedeCancelar = t.match(CANCELAR);
  const novaData = p.agendamento.dia !== null || p.agendamento.hora !== null;
  const mesmaVisita = novaData && ehAMesmaVisita(p.agendamento, p.visitaMarcada);

  const contraproposta = novaData && !mesmaVisita ? t.match(CONTRAPROPOSTA) : null;

  if (pedeRemarcar || contraproposta || (pedeCancelar && novaData && !mesmaVisita)) {
    return {
      tipo: "remarcar",
      dia: p.agendamento.dia,
      hora: p.agendamento.hora,
      trecho: (pedeRemarcar ?? contraproposta ?? pedeCancelar)![0],
    };
  }
  if (pedeCancelar) return { tipo: "cancelar", trecho: pedeCancelar[0] };

  // Só a nova data, curta, diferente da marcada: é a resposta de quem está
  // trocando ("e domingo às 10?").
  if (novaData && !mesmaVisita && t.split(/\s+/).length <= PALAVRAS_DE_UMA_RESPOSTA) {
    return { tipo: "remarcar", dia: p.agendamento.dia, hora: p.agendamento.hora, trecho: t };
  }
  return null;
}

// ─── Datas no fuso de São Paulo ────────────────────────────────────────────

const FUSO = "America/Sao_Paulo";

/** Dia da semana, data e hora em São Paulo. Nunca `getDay()`: o servidor roda em UTC. */
function partes(data: Date): { ano: number; mes: number; dia: number; hora: number; diaSemana: number } {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(data);
  const v = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? "";
  const semana: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    ano: Number(v("year")),
    mes: Number(v("month")),
    dia: Number(v("day")),
    hora: Number(v("hour")) % 24,
    diaSemana: semana[v("weekday")] ?? 0,
  };
}

/** O instante de um dia/hora de São Paulo (o Brasil não tem horário de verão desde 2019). */
function emSaoPaulo(ano: number, mes: number, dia: number, hora: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, hora + 3, 0, 0));
}

const DIA_DA_SEMANA: Record<string, number> = {
  domingo: 0,
  "segunda-feira": 1,
  "terça-feira": 2,
  "quarta-feira": 3,
  "quinta-feira": 4,
  "sexta-feira": 5,
  sábado: 6,
};

/** O dia da semana que um rótulo de `pedidoDeAgendamento` nomeia, ou null para os relativos. */
function diaDaSemanaDoRotulo(rotulo: string): number | null {
  return DIA_DA_SEMANA[rotulo] ?? null;
}

/**
 * A data que "sábado às 10" quer dizer, a partir de `depoisDe`.
 *
 * Dia da semana é a PRÓXIMA ocorrência; hoje só vale se a hora ainda não
 * passou. Sem dia, vale o mesmo dia da visita de referência (ou hoje). Sem
 * hora, null: não se grava compromisso sem hora.
 */
export function resolverDataDaVisita(p: {
  dia: string | null;
  hora: number | null;
  depoisDe: Date;
  /** Na remarcação só da hora ("pode ser às 15?"), o dia é o da visita marcada. */
  diaDeReferencia?: Date | null;
}): Date | null {
  if (p.hora === null || p.hora < 0 || p.hora > 23) return null;
  const agora = partes(p.depoisDe);
  const base = emSaoPaulo(agora.ano, agora.mes, agora.dia, 0);
  const somarDias = (n: number) => {
    const d = new Date(base.getTime() + n * 86_400_000);
    const q = partes(d);
    return emSaoPaulo(q.ano, q.mes, q.dia, p.hora!);
  };

  if (p.dia === null) {
    if (p.diaDeReferencia) {
      const r = partes(p.diaDeReferencia);
      return emSaoPaulo(r.ano, r.mes, r.dia, p.hora);
    }
    const hoje = somarDias(0);
    return hoje.getTime() > p.depoisDe.getTime() ? hoje : somarDias(1);
  }
  if (p.dia === "hoje") return somarDias(0);
  if (p.dia === "amanhã") return somarDias(1);
  if (p.dia === "depois de amanhã") return somarDias(2);

  const alvo = diaDaSemanaDoRotulo(p.dia);
  if (alvo === null) return null;
  let n = (alvo - agora.diaSemana + 7) % 7;
  if (n === 0 && somarDias(0).getTime() <= p.depoisDe.getTime()) n = 7;
  return somarDias(n);
}

/** "sábado, 10/10 às 10h", no fuso de São Paulo. */
export function rotuloDaVisita(data: Date): string {
  const p = partes(data);
  const nomes = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const dd = String(p.dia).padStart(2, "0");
  const mm = String(p.mes).padStart(2, "0");
  return `${nomes[p.diaSemana]}, ${dd}/${mm} às ${p.hora}h`;
}

/**
 * O que ele disse é a visita que já está marcada? "sábado às 10, né?" com a
 * visita marcada para sábado às 10 é confirmação, não troca.
 */
function ehAMesmaVisita(agendamento: PedidoDeAgendamento, visita: Date): boolean {
  const v = partes(visita);
  if (agendamento.hora !== null && agendamento.hora !== v.hora) return false;
  if (agendamento.dia !== null) {
    const alvo = diaDaSemanaDoRotulo(agendamento.dia);
    if (alvo === null || alvo !== v.diaSemana) return false;
  }
  return true;
}

// ─── A visita que o CORRETOR combina no chat (A2, 06/10/2026) ──────────────

/**
 * O corretor afirmando um combinado: "combinado, sábado às 10", "te espero
 * domingo às 11h". Pergunta ("sábado às 10 pode?") é proposta, não combinado.
 */
const AFIRMA_COMBINADO =
  /\b(combinad[oa]|agendad[oa]|marcad[oa]|confirmad[oa]|anotad[oa]|reservad[oa]|fechad[oa]|te espero|te aguardo|nos vemos|ta marcado|esta marcado)\b/;

/** O cliente aceitando o que o corretor propôs, curto e sem negar. */
const ACEITE_DO_CLIENTE =
  /^(s+i+m+|pode ser|pode|ok|okay|ok!|combinado|fechado|beleza|blz|perfeito|certo|top|otimo|show|bora|claro|isso|confirmado|confirmo|pode marcar|marca|marcado|fica bom|fica otimo|da sim|consigo|consigo sim|vou sim|estarei la|estarei|👍)(\s|[!.,]|$)/;

const NEGA = /\b(nao|n)\b/;

/**
 * A visita que o corretor combinou com o cliente no chat, com a IA calada.
 *
 * Ele marca de cabeça e o CRM não fica sabendo: a visita não entra na
 * agenda, o lembrete de véspera não sai e o funil fica parado. Duas formas,
 * as duas com dia E hora na fala do corretor:
 *
 * 1. Ele afirma o combinado ("combinado, sábado às 10").
 * 2. Ele propôs ("sábado às 10 fica bom?") e o cliente aceitou ("pode ser").
 *
 * O resultado nunca é gravado sozinho: vira uma sugestão no Início, que o
 * corretor confirma com um toque. A fala dele pode ser sobre outra coisa
 * (uma ligação, a entrega das chaves), e só ele sabe.
 */
export function visitaCombinadaNoChat(p: {
  /** A fala do corretor que acabou de chegar (forma 1). */
  falaDoCorretor?: string;
  /** A fala do cliente que acabou de chegar e a última do corretor antes dela (forma 2). */
  falaDoCliente?: string;
  propostaDoCorretor?: string;
  agora: Date;
  visitaMarcada: Date | null;
}): Date | null {
  let origem: string | null = null;
  if (p.falaDoCorretor) {
    const t = normalizar(p.falaDoCorretor).trim();
    if (AFIRMA_COMBINADO.test(t) && !t.endsWith("?")) origem = p.falaDoCorretor;
  } else if (p.falaDoCliente && p.propostaDoCorretor) {
    const c = normalizar(p.falaDoCliente).trim();
    if (c.split(/\s+/).length <= 6 && ACEITE_DO_CLIENTE.test(c) && !NEGA.test(c)) origem = p.propostaDoCorretor;
  }
  if (!origem) return null;

  const pedido = pedidoDeAgendamento(origem);
  if (pedido.dia === null || pedido.hora === null) return null;
  const quando = resolverDataDaVisita({ dia: pedido.dia, hora: pedido.hora, depoisDe: p.agora });
  if (!quando) return null;
  if (p.visitaMarcada && p.visitaMarcada.getTime() === quando.getTime()) return null;
  return quando;
}

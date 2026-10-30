import { lerRespostaAoLembrete, type LeituraDoLembrete } from "@/lib/whatsapp/followupTexto";

/**
 * Confirmação de visita pelo WhatsApp (0246, 29/10/2026) — a régua, pura.
 *
 * Dois caminhos levam o MESMO texto ao cliente:
 *
 * - o toque "Pedir confirmação" do corretor, na Agenda, até 36h antes;
 * - a confirmação automática do grupo (opt-in, desligada por padrão), até
 *   24h antes, com as travas do lembrete de véspera que já existe (janela,
 *   expediente do corretor, cota anti-ban, IA desligada na conversa ou no
 *   número). O lembrete escrito pela IA continua como era: um pedido já
 *   enviado conta como o lembrete daquela data, e vice-versa — o cliente
 *   nunca recebe os dois.
 *
 * A resposta é lida pela régua que já existe para o lembrete
 * (`lerRespostaAoLembrete`: a negação vence, a dúvida não grava). Resposta
 * ambígua fica na conversa: o corretor lê.
 */

/** Até quantas horas antes o corretor pode pedir. */
export const ANTECEDENCIA_DO_PEDIDO_H = 36;

/** A janela da confirmação automática: entre 2h e 24h antes da visita. */
export const JANELA_AUTOMATICA = { minH: 2, maxH: 24 } as const;

export type SituacaoDaVisita = {
  inicio: string;
  status: string;
  /** O "confirmo" do cliente para ESTA data (leads.visita_confirmada_em). */
  confirmadaPeloCliente: boolean;
  confirmacaoPedidaEm: string | null;
  remarcacaoPedidaEm: string | null;
};

export type PodePedir =
  | { pode: true }
  | { pode: false; motivo: "nao_marcada" | "passou" | "longe_demais" | "ja_confirmada" | "ja_pedida" | "pediu_remarcar" };

/** O corretor pode tocar em "Pedir confirmação" agora? */
export function podePedirConfirmacao(v: SituacaoDaVisita, agora: Date): PodePedir {
  if (v.status !== "marcada") return { pode: false, motivo: "nao_marcada" };
  const faltaMs = Date.parse(v.inicio) - agora.getTime();
  if (!(faltaMs > 0)) return { pode: false, motivo: "passou" };
  if (faltaMs > ANTECEDENCIA_DO_PEDIDO_H * 3_600_000) return { pode: false, motivo: "longe_demais" };
  if (v.confirmadaPeloCliente) return { pode: false, motivo: "ja_confirmada" };
  if (v.remarcacaoPedidaEm) return { pode: false, motivo: "pediu_remarcar" };
  if (v.confirmacaoPedidaEm) return { pode: false, motivo: "ja_pedida" };
  return { pode: true };
}

/** A visita está na janela da confirmação automática? */
export function naJanelaAutomatica(inicio: string, agora: Date): boolean {
  const faltaH = (Date.parse(inicio) - agora.getTime()) / 3_600_000;
  return faltaH >= JANELA_AUTOMATICA.minH && faltaH <= JANELA_AUTOMATICA.maxH;
}

export const MOTIVO_EM_PORTUGUES: Record<Exclude<PodePedir, { pode: true }>["motivo"], string> = {
  nao_marcada: "Esta visita não está mais marcada.",
  passou: "O horário desta visita já passou.",
  longe_demais: `Dá para pedir a confirmação a partir de ${ANTECEDENCIA_DO_PEDIDO_H}h antes da visita.`,
  ja_confirmada: "O cliente já confirmou esta visita.",
  ja_pedida: "A confirmação já foi pedida para esta visita.",
  pediu_remarcar: "O cliente pediu para remarcar: combine o novo horário na conversa.",
};

const DIA_SP = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const HORA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const DATA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit" });

/** "hoje às 10h", "amanhã às 14h30", "sexta-feira, 31/10, às 9h". */
export function quandoDaVisita(inicio: string, agora: Date): string {
  const d = new Date(inicio);
  const hora = HORA_SP.format(d).replace(/^0(\d)/, "$1").replace(/:00$/, "h").replace(":", "h");
  const dia = DIA_SP(d);
  if (dia === DIA_SP(agora)) return `hoje às ${hora}`;
  if (dia === DIA_SP(new Date(agora.getTime() + 86_400_000))) return `amanhã às ${hora}`;
  return `${DATA_SP.format(d)}, às ${hora}`;
}

/**
 * O texto que vai ao cliente. Fixo de propósito (não é a IA escrevendo): o
 * corretor sabe exatamente o que saiu do número dele, e o cliente lê uma
 * pergunta só, com as duas respostas que a leitura entende.
 */
export function textoDoPedidoDeConfirmacao(p: {
  cliente: string | null;
  corretor: string;
  inicio: string;
  /** O nome do que vai ser visitado, do cadastro; `null` sem ele. */
  lugar: string | null;
  agora: Date;
}): string {
  const nome = p.cliente?.trim().split(/\s+/)[0];
  const saudacao = nome && !/^whatsapp$/i.test(nome) ? `Oi, ${nome}!` : "Oi!";
  const lugar = p.lugar?.trim() ? ` no ${p.lugar.trim()}` : "";
  return (
    `${saudacao} Aqui é ${p.corretor.trim().split(/\s+/)[0]}. Passando para confirmar nossa visita ${quandoDaVisita(p.inicio, p.agora)}${lugar}. ` +
    `Posso contar com você? Responda *confirmo* ou, se precisar, *remarcar*.`
  );
}

/** A resposta do cliente, pela régua do lembrete. `null` = ambígua (fica na conversa). */
export function lerRespostaDoCliente(texto: string): LeituraDoLembrete {
  return lerRespostaAoLembrete(texto);
}

import type { Dia } from "@/lib/agenda/calendario";

/**
 * O que o corretor (ou o gestor) pediu à Agenda por mensagem de WhatsApp.
 *
 * Todo instante é ISO 8601 COM fuso, já reescrito em São Paulo
 * ("2026-11-01T10:00:00-03:00"): sem fuso, `new Date()` leria a hora no fuso
 * do servidor (UTC na Vercel) e marcaria tudo 3 horas fora.
 *
 * `cliente`, `imovel` e `participantes` são o que a pessoa ESCREVEU ("Ana",
 * "Alpha"), não ids: achar o lead certo é de quem integra, com
 * `escolherLeadsPorNome`.
 */
export type PedidoDoCorretor =
  | { tipo: "marcar_visita"; cliente: string; quando: string; imovel: string | null }
  | { tipo: "bloquear"; inicio: string; fim: string; motivo: string | null }
  | { tipo: "lembrete"; cliente: string | null; texto: string; quando: string }
  | { tipo: "consultar"; dia: Dia }
  /** Só gestor. `"equipe"` = a equipe toda; senão, os nomes que ele citou. */
  | { tipo: "reuniao"; titulo: string; inicio: string; fim: string; participantes: "equipe" | string[] }
  | { tipo: "nao_entendi" };

/** Pedidos que viram compromisso e por isso pedem "Confirma? (sim/não)". */
export type PedidoAConfirmar = Exclude<PedidoDoCorretor, { tipo: "nao_entendi" | "consultar" }>;

export const NAO_ENTENDI: PedidoDoCorretor = { tipo: "nao_entendi" };

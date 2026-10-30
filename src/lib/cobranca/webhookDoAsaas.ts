import { createHash, timingSafeEqual } from "node:crypto";
import { diaEmSP } from "@/lib/crm/resumoDoDia";
import type { createServiceClient } from "@/lib/supabase/service";
import { competenciaDoVencimento } from "./assinatura";
import type { PagamentoDoAsaas } from "./asaas";
import { recompensarIndicacao } from "@/lib/indicacoes/indicacao";

/**
 * O que o webhook do Asaas faz com cada evento (29/10/2026, 0241). A rota
 * (`src/app/api/webhooks/asaas/route.ts`) confere o token e chama isto com
 * o cliente da chave de serviço; os testes passam um cliente falso.
 *
 * - `PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED`: registra o pagamento em
 *   `pagamentos_do_grupo` na competência do mês do vencimento (`dueDate`).
 *   Idempotente por `asaas_pagamento_id` (único, 0241): o Asaas entrega
 *   "pelo menos uma vez", e no cartão chegam os DOIS eventos do mesmo
 *   pagamento. Registrar já reativa o grupo suspenso por atraso: a
 *   suspensão é derivada (`cobranca.ts`), não gravada.
 * - `PAYMENT_OVERDUE`: nada muda no banco (o painel já deriva o atraso);
 *   só avisa os administradores.
 * - Qualquer outro evento: ignorado (a rota responde 200 do mesmo jeito,
 *   senão o Asaas repete e pausa a fila depois de 15 falhas).
 *
 * Indique e ganhe (0247): depois de registrar (e também no evento repetido,
 * para uma recompensa que falhou na primeira entrega sair na seguinte), a
 * conta indicada que paga a primeira mensalidade gera o crédito de quem
 * indicou (`recompensarIndicacao`, idempotente). Falha dela só vai ao log:
 * o pagamento já está gravado e o Asaas não deve repetir por causa disso.
 *
 * O grupo sai da ASSINATURA do pagamento (`grupos.asaas_assinatura_id`) e,
 * sem ela (cobrança avulsa, assinatura já desligada), do CLIENTE
 * (`grupos.asaas_cliente_id`). Ids únicos no banco: não há ambiguidade.
 * Nunca do corpo do evento além desses ids.
 */

type Servico = ReturnType<typeof createServiceClient>;

export type EventoDoAsaas = {
  id?: string;
  event?: string;
  payment?: Partial<PagamentoDoAsaas> | null;
};

export type Aviso = { titulo: string; corpo: string; url: string; tag: string };

export type Desfecho =
  | { resultado: "ignorado"; motivo: string }
  | { resultado: "grupo_desconhecido" }
  | { resultado: "registrado"; grupoId: string; competencia: string }
  | { resultado: "repetido"; grupoId: string }
  | { resultado: "competencia_ja_paga"; grupoId: string; competencia: string }
  | { resultado: "vencido_avisado"; grupoId: string }
  /** Falha do banco: a rota responde 500 e o Asaas tenta de novo. */
  | { resultado: "falhou"; motivo: string };

const RECEBIDO = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const VENCIDO = "PAYMENT_OVERDUE";

/**
 * Compara o token recebido com o esperado em tempo constante (pelo hash dos
 * dois: `timingSafeEqual` exige o mesmo tamanho, e comparar o tamanho antes
 * vazaria o tamanho). Esperado vazio recusa tudo.
 */
export function tokenDoAsaasValido(recebido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!esperado || !recebido) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function reaisDoAviso(valor: number): string {
  // Espaço comum no lugar do inquebrável: o texto vai para a notificação.
  return REAIS.format(valor).replace(/ /g, " ");
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;

async function acharGrupo(
  servico: Servico,
  pagamento: Partial<PagamentoDoAsaas>,
): Promise<{ ok: true; grupo: { id: string; nome: string } | null } | { ok: false; motivo: string }> {
  const tentativas: ["asaas_assinatura_id" | "asaas_cliente_id", string | null | undefined][] = [
    ["asaas_assinatura_id", pagamento.subscription],
    ["asaas_cliente_id", pagamento.customer],
  ];
  for (const [coluna, valor] of tentativas) {
    if (typeof valor !== "string" || !ID.test(valor)) continue;
    const { data, error } = await servico.from("grupos").select("id, nome").eq(coluna, valor).maybeSingle();
    if (error) return { ok: false, motivo: `grupo não lido por ${coluna}: ${error.message}` };
    if (data) return { ok: true, grupo: data };
  }
  return { ok: true, grupo: null };
}

/** O crédito da indicação depois do pagamento gravado (0247). Nunca lança. */
async function recompensarDepoisDoPagamento(
  servico: Servico,
  grupo: { id: string; nome: string },
  avisar: (aviso: Aviso) => void,
): Promise<void> {
  const r = await recompensarIndicacao(servico, grupo.id);
  if (r.resultado === "falhou") {
    console.error(`[asaas] recompensa da indicação (${grupo.id}) não gerada: ${r.motivo}`);
    return;
  }
  if (r.resultado === "gerado") {
    avisar({
      titulo: "Crédito de indicação gerado",
      corpo: `${grupo.nome} pagou a primeira mensalidade: quem indicou ganhou ${r.descricao}. Aplique na cobrança.`,
      url: `/plataforma/grupos/${r.grupoBeneficiadoId}`,
      tag: `indicacao-${r.creditoId}`,
    });
  }
}

export async function processarEventoDoAsaas(
  servico: Servico,
  evento: EventoDoAsaas,
  avisar: (aviso: Aviso) => void,
  agora: Date = new Date(),
): Promise<Desfecho> {
  const tipo = typeof evento?.event === "string" ? evento.event : "";
  if (!RECEBIDO.has(tipo) && tipo !== VENCIDO) return { resultado: "ignorado", motivo: `evento ${tipo || "sem tipo"}` };
  const pagamento = evento.payment;
  if (!pagamento || typeof pagamento.id !== "string" || !ID.test(pagamento.id)) {
    return { resultado: "ignorado", motivo: "evento sem pagamento" };
  }

  const achado = await acharGrupo(servico, pagamento);
  if (!achado.ok) return { resultado: "falhou", motivo: achado.motivo };
  const grupo = achado.grupo;
  if (!grupo) return { resultado: "grupo_desconhecido" };
  const url = `/plataforma/grupos/${grupo.id}`;

  if (tipo === VENCIDO) {
    avisar({
      titulo: "Mensalidade vencida",
      corpo: `Mensalidade vencida: ${grupo.nome}.`,
      url,
      tag: `asaas-vencida-${grupo.id}`,
    });
    return { resultado: "vencido_avisado", grupoId: grupo.id };
  }

  const competencia = competenciaDoVencimento(typeof pagamento.dueDate === "string" ? pagamento.dueDate : "");
  const valor = Number(pagamento.value);
  if (!competencia || !Number.isFinite(valor) || valor < 0) {
    return { resultado: "ignorado", motivo: "pagamento sem vencimento ou valor" };
  }

  // Idempotência: o mesmo pagamento já registrado (evento repetido, ou o
  // CONFIRMED e depois o RECEIVED do cartão) não registra nem avisa de novo.
  const { data: jaRegistrado, error: erroDaBusca } = await servico
    .from("pagamentos_do_grupo")
    .select("id")
    .eq("asaas_pagamento_id", pagamento.id)
    .maybeSingle();
  if (erroDaBusca) return { resultado: "falhou", motivo: `pagamento não conferido: ${erroDaBusca.message}` };
  if (jaRegistrado) {
    await recompensarDepoisDoPagamento(servico, grupo, avisar);
    return { resultado: "repetido", grupoId: grupo.id };
  }

  const dataDoPagamento = [pagamento.paymentDate, pagamento.clientPaymentDate].find(
    (d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
  );
  const pagoEm = dataDoPagamento ?? diaEmSP(agora);
  const forma = typeof pagamento.billingType === "string" ? pagamento.billingType.slice(0, 20) : "";

  const { error } = await servico.from("pagamentos_do_grupo").insert({
    grupo_id: grupo.id,
    competencia,
    valor,
    pago_em: pagoEm,
    registrado_por: null,
    observacao: `Asaas${forma ? ` (${forma})` : ""}: pagamento ${pagamento.id}`,
    asaas_pagamento_id: pagamento.id,
  });
  if (error) {
    if (error.code !== "23505") return { resultado: "falhou", motivo: `pagamento não gravado: ${error.message}` };
    // Corrida com o mesmo evento: a outra entrega gravou primeiro.
    const { data: corrida } = await servico
      .from("pagamentos_do_grupo")
      .select("id")
      .eq("asaas_pagamento_id", pagamento.id)
      .maybeSingle();
    if (corrida) return { resultado: "repetido", grupoId: grupo.id };
    // A competência já tinha pagamento (registro à mão, ou outra cobrança):
    // o dinheiro entrou, mas o registro não. A plataforma confere.
    avisar({
      titulo: "Pagamento recebido para conferir",
      corpo: `Pagamento recebido: ${grupo.nome} ${reaisDoAviso(valor)}. A competência ${competencia.slice(5, 7)}/${competencia.slice(0, 4)} já estava paga: confira na cobrança.`,
      url,
      tag: `asaas-pagamento-${pagamento.id}`,
    });
    return { resultado: "competencia_ja_paga", grupoId: grupo.id, competencia };
  }

  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: grupo.id,
    acao: "pagamento_registrado",
    ator_id: null,
    ator_plataforma_user_id: null,
    alvo_corretor_id: null,
    detalhes: { origem: "asaas", competencia, valor, pago_em: pagoEm, asaas_pagamento_id: pagamento.id },
  });
  if (erroDoEvento) console.error(`[asaas] evento do pagamento (${grupo.id}) não gravado: ${erroDoEvento.message}`);

  avisar({
    titulo: "Pagamento recebido",
    corpo: `Pagamento recebido: ${grupo.nome} ${reaisDoAviso(valor)}.`,
    url,
    tag: `asaas-pagamento-${pagamento.id}`,
  });
  await recompensarDepoisDoPagamento(servico, grupo, avisar);
  return { resultado: "registrado", grupoId: grupo.id, competencia };
}

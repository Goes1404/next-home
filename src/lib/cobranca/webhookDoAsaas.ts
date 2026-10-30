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
 * - `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`,
 *   `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_DELETED` (revisão de 30/10/2026):
 *   o dinheiro voltou (ou pode voltar) — a linha de `pagamentos_do_grupo`
 *   desse `asaas_pagamento_id` sai (idempotente: sem linha, nada a tirar), a
 *   competência volta a ficar em aberto no painel, e os administradores são
 *   avisados. O crédito de indicação gerado por ESSE pagamento: se ainda não
 *   foi aplicado, é apagado e a recompensa é recalculada (sai de novo se a
 *   conta tiver outro pagamento de verdade, `recompensarIndicacao`); se já
 *   foi aplicado (o desconto já foi dado), NÃO some — ganha uma observação
 *   "revisar" e o aviso pede a conferência à mão.
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
  | { resultado: "estornado"; grupoId: string | null; removido: boolean; creditoParaRevisar: boolean }
  /** Falha do banco: a rota responde 500 e o Asaas tenta de novo. */
  | { resultado: "falhou"; motivo: string };

const RECEBIDO = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const VENCIDO = "PAYMENT_OVERDUE";
/** O pagamento deixou de valer (ou está em disputa): o registro sai. */
const DESFEITO: Record<string, string> = {
  PAYMENT_REFUNDED: "estornado",
  PAYMENT_CHARGEBACK_REQUESTED: "com chargeback pedido",
  PAYMENT_CHARGEBACK_DISPUTE: "em disputa de chargeback",
  PAYMENT_DELETED: "apagado no Asaas",
};

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
  if (!RECEBIDO.has(tipo) && tipo !== VENCIDO && !DESFEITO[tipo]) {
    return { resultado: "ignorado", motivo: `evento ${tipo || "sem tipo"}` };
  }
  const pagamento = evento.payment;
  if (!pagamento || typeof pagamento.id !== "string" || !ID.test(pagamento.id)) {
    return { resultado: "ignorado", motivo: "evento sem pagamento" };
  }
  if (DESFEITO[tipo]) return desfazerPagamento(servico, tipo, pagamento as Partial<PagamentoDoAsaas> & { id: string }, avisar);

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

/**
 * Estorno, chargeback ou cobrança apagada: tira o registro do pagamento (se
 * houver) e cuida do crédito de indicação que ele gerou. Idempotente: a
 * segunda entrega não acha linha e não mexe em nada.
 */
async function desfazerPagamento(
  servico: Servico,
  tipo: string,
  pagamento: Partial<PagamentoDoAsaas> & { id: string },
  avisar: (aviso: Aviso) => void,
): Promise<Desfecho> {
  const { data: registro, error: erroDaBusca } = await servico
    .from("pagamentos_do_grupo")
    .select("id, grupo_id, competencia, valor, pago_em")
    .eq("asaas_pagamento_id", pagamento.id)
    .maybeSingle();
  if (erroDaBusca) return { resultado: "falhou", motivo: `pagamento não conferido: ${erroDaBusca.message}` };

  let grupo: { id: string; nome: string } | null = null;
  if (registro) {
    const { data } = await servico.from("grupos").select("id, nome").eq("id", registro.grupo_id).maybeSingle();
    grupo = data ?? { id: registro.grupo_id, nome: "Uma conta" };
  } else {
    const achado = await acharGrupo(servico, pagamento);
    if (!achado.ok) return { resultado: "falhou", motivo: achado.motivo };
    grupo = achado.grupo;
  }

  // Cobrança apagada que nunca foi paga: não havia o que tirar nem avisar.
  if (!registro && tipo === "PAYMENT_DELETED") {
    return { resultado: "estornado", grupoId: grupo?.id ?? null, removido: false, creditoParaRevisar: false };
  }

  let creditoParaRevisar = false;
  let recalcular = false;
  if (registro) {
    // O crédito é lido ANTES de apagar o pagamento: a FK zera `pagamento_id`.
    const { data: creditos, error: erroDoCredito } = await servico
      .from("creditos_de_indicacao")
      .select("id, aplicado_em, observacao")
      .eq("pagamento_id", registro.id);
    if (erroDoCredito) return { resultado: "falhou", motivo: `crédito não conferido: ${erroDoCredito.message}` };

    const { error: erroDoDelete } = await servico.from("pagamentos_do_grupo").delete().eq("id", registro.id);
    if (erroDoDelete) return { resultado: "falhou", motivo: `pagamento não removido: ${erroDoDelete.message}` };

    for (const credito of creditos ?? []) {
      if (!credito.aplicado_em) {
        // Ainda não virou desconto: apaga (só se continuar não aplicado).
        const { data: apagado, error } = await servico
          .from("creditos_de_indicacao")
          .delete()
          .eq("id", credito.id)
          .is("aplicado_em", null)
          .select("id");
        if (error) console.error(`[asaas] crédito ${credito.id} não apagado após ${tipo}: ${error.message}`);
        if (!error && apagado?.length) {
          recalcular = true;
          continue;
        }
      }
      // Já aplicado (ou não deu para apagar): fica, marcado para revisão.
      creditoParaRevisar = true;
      const nota = `Revisar: o pagamento ${pagamento.id} que gerou este crédito foi ${DESFEITO[tipo]}.`;
      const observacao = [nota, credito.observacao].filter(Boolean).join(" ").slice(0, 1000);
      const { error } = await servico.from("creditos_de_indicacao").update({ observacao }).eq("id", credito.id);
      if (error) console.error(`[asaas] crédito ${credito.id} não marcado para revisão: ${error.message}`);
    }

    const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
      grupo_id: registro.grupo_id,
      acao: "pagamento_removido",
      ator_id: null,
      ator_plataforma_user_id: null,
      alvo_corretor_id: null,
      detalhes: {
        origem: "asaas",
        evento: tipo,
        competencia: registro.competencia,
        valor: Number(registro.valor),
        pago_em: registro.pago_em,
        asaas_pagamento_id: pagamento.id,
      },
    });
    if (erroDoEvento) console.error(`[asaas] evento da remoção (${registro.grupo_id}) não gravado: ${erroDoEvento.message}`);
  }

  if (grupo) {
    const valor = Number(registro?.valor ?? pagamento.value);
    const quanto = Number.isFinite(valor) ? ` ${reaisDoAviso(valor)}` : "";
    const partes = [`Pagamento ${DESFEITO[tipo]}: ${grupo.nome}${quanto}.`];
    if (registro) {
      partes.push(`A competência ${registro.competencia.slice(5, 7)}/${registro.competencia.slice(0, 4)} voltou a ficar em aberto.`);
    }
    if (creditoParaRevisar) partes.push("O crédito de indicação que ele gerou já foi aplicado: revise à mão.");
    avisar({
      titulo: "Pagamento desfeito no Asaas",
      corpo: partes.join(" "),
      url: `/plataforma/grupos/${grupo.id}`,
      tag: `asaas-desfeito-${pagamento.id}`,
    });
  }

  // O crédito apagado volta se a conta tiver outro pagamento de verdade.
  if (recalcular && grupo) await recompensarDepoisDoPagamento(servico, grupo, avisar);

  return { resultado: "estornado", grupoId: grupo?.id ?? null, removido: Boolean(registro), creditoParaRevisar };
}

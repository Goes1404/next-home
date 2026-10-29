"use server";

import { revalidatePath } from "next/cache";
import { avisarSituacaoDaConta } from "@/lib/notificacoes/avisosDaPlataforma";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import {
  lerCompetenciaDigitada,
  lerDataDoPagamento,
  lerDiaDoVencimentoDigitado,
  lerMensalidadeDigitada,
  lerObservacaoDigitada,
  lerValorDigitado,
} from "@/lib/planos/pagamentosDigitados";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * A cobrança manual do grupo na plataforma (fase 2C, desenho §11).
 *
 * Mesma regra de `acoes.ts`: a chave de serviço nunca decide QUEM pode. Quem
 * decide é `exigirAdminDaPlataformaNaAcao()`, pela sessão, sempre primeiro; a
 * chave só entra depois (`pagamentos_do_grupo` não tem grant para ninguém).
 * Cada mudança fica em `admin_eventos`, como `ajustarTetoDaIa`.
 *
 * Nada aqui lê conversa, ficha nem lead (§4).
 */

type Servico = ReturnType<typeof createServiceClient>;

export type ResultadoDaCobranca = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível salvar agora. Tente de novo.";

async function registrarEvento(
  servico: Servico,
  grupoId: string,
  userId: string,
  acao: "pagamento_registrado" | "pagamento_removido" | "grupo_suspenso" | "grupo_reativado",
  detalhes: Record<string, string | number | null>,
) {
  const { error } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao,
    ator_id: null,
    ator_plataforma_user_id: userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", ...detalhes },
  });
  if (error) console.error(`[plataforma] evento ${acao} (${grupoId}) não gravado: ${error.message}`);
}

function atualizarTelas(grupoId: string) {
  revalidatePath("/plataforma");
  revalidatePath(`/plataforma/grupos/${grupoId}`);
}

export type PagamentoDigitado = {
  /** `AAAA-MM`, como o campo de mês entrega. */
  competencia: string;
  valor: string;
  /** `AAAA-MM-DD`. */
  pagoEm: string;
  observacao: string;
};

/**
 * Registra que o grupo pagou uma competência. Um pagamento por competência:
 * o registro errado se remove (`removerPagamento`) e se refaz, e isso fica
 * nos dois eventos. O plano `custo` aceita registro (só não é exigido).
 */
export async function registrarPagamento(grupoId: string, pedido: PagamentoDigitado): Promise<ResultadoDaCobranca> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const competencia = lerCompetenciaDigitada(pedido.competencia);
  if (!competencia.ok) return { ok: false, erro: competencia.erro };
  const valor = lerValorDigitado(pedido.valor);
  if (!valor.ok) return { ok: false, erro: valor.erro };
  const pagoEm = lerDataDoPagamento(pedido.pagoEm);
  if (!pagoEm.ok) return { ok: false, erro: pagoEm.erro };
  const observacao = lerObservacaoDigitada(pedido.observacao);
  if (!observacao.ok) return { ok: false, erro: observacao.erro };

  const servico = createServiceClient();
  const { data: grupo, error: erroDoGrupo } = await servico.from("grupos").select("id").eq("id", grupoId).maybeSingle();
  if (erroDoGrupo) {
    console.error(`[plataforma] grupo ${grupoId} não lido para registrar pagamento: ${erroDoGrupo.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!grupo) return { ok: false, erro: "Grupo não encontrado." };

  const { error } = await servico.from("pagamentos_do_grupo").insert({
    grupo_id: grupoId,
    competencia: competencia.valor,
    valor: valor.valor,
    pago_em: pagoEm.valor,
    registrado_por: guarda.userId,
    observacao: observacao.valor,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, erro: "Esta competência já tem pagamento registrado. Remova o registro errado antes de refazer." };
    }
    console.error(`[plataforma] pagamento do grupo ${grupoId} não gravado: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  await registrarEvento(servico, grupoId, guarda.userId, "pagamento_registrado", {
    competencia: competencia.valor,
    valor: valor.valor,
    pago_em: pagoEm.valor,
  });
  atualizarTelas(grupoId);
  return { ok: true };
}

/** Remove um registro errado. O pagamento tem de ser do grupo informado. */
export async function removerPagamento(grupoId: string, pagamentoId: string): Promise<ResultadoDaCobranca> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId) || !ehUuid(pagamentoId)) return { ok: false, erro: "Pagamento não encontrado." };

  const servico = createServiceClient();
  const { data, error } = await servico
    .from("pagamentos_do_grupo")
    .delete()
    .eq("id", pagamentoId)
    .eq("grupo_id", grupoId)
    .select("competencia, valor, pago_em");
  if (error) {
    console.error(`[plataforma] pagamento ${pagamentoId} do grupo ${grupoId} não removido: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  const removido = data?.[0];
  if (!removido) return { ok: false, erro: "Pagamento não encontrado." };

  await registrarEvento(servico, grupoId, guarda.userId, "pagamento_removido", {
    competencia: removido.competencia,
    valor: Number(removido.valor),
    pago_em: removido.pago_em,
  });
  atualizarTelas(grupoId);
  return { ok: true };
}

/**
 * A mensalidade combinada (em branco = não definida) e o dia do vencimento.
 * Mudar o dia vale para as competências ainda não pagas: o que já foi pago
 * continua pago.
 */
export async function ajustarCobrancaDoGrupo(
  grupoId: string,
  pedido: { mensalidade: string; diaDoVencimento: string },
): Promise<ResultadoDaCobranca> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const mensalidade = lerMensalidadeDigitada(pedido.mensalidade);
  if (!mensalidade.ok) return { ok: false, erro: mensalidade.erro };
  const dia = lerDiaDoVencimentoDigitado(pedido.diaDoVencimento);
  if (!dia.ok) return { ok: false, erro: dia.erro };

  const { data, error } = await createServiceClient()
    .from("grupos")
    .update({ mensalidade: mensalidade.valor, dia_do_vencimento: dia.valor })
    .eq("id", grupoId)
    .select("id");
  if (error) {
    console.error(`[plataforma] cobrança do grupo ${grupoId} não gravada: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Grupo não encontrado." };

  atualizarTelas(grupoId);
  return { ok: true };
}

/**
 * Suspende o grupo à mão: IA, listas, artes e vídeos param, como na
 * suspensão por atraso. Só um grupo ativo suspende (o encerrado já está
 * parado, e o cancelamento tem a própria ação).
 */
export async function suspenderGrupo(grupoId: string): Promise<ResultadoDaCobranca> {
  return mudarSituacao(grupoId, "ativo", "suspenso", "grupo_suspenso", "Só um grupo ativo pode ser suspenso.");
}

/** Reativa um grupo suspenso à mão. A suspensão por atraso se desfaz registrando o pagamento. */
export async function reativarGrupo(grupoId: string): Promise<ResultadoDaCobranca> {
  return mudarSituacao(grupoId, "suspenso", "ativo", "grupo_reativado", "Só um grupo suspenso pode ser reativado.");
}

async function mudarSituacao(
  grupoId: string,
  de: "ativo" | "suspenso",
  para: "ativo" | "suspenso",
  acao: "grupo_suspenso" | "grupo_reativado",
  erroDeEstado: string,
): Promise<ResultadoDaCobranca> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const servico = createServiceClient();
  const { data, error } = await servico
    .from("grupos")
    .update({ situacao: para })
    .eq("id", grupoId)
    .eq("situacao", de)
    .is("cancelado_em", null)
    .select("id, nome");
  if (error) {
    console.error(`[plataforma] situação do grupo ${grupoId} não mudou para ${para}: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!data || data.length === 0) return { ok: false, erro: erroDeEstado };

  await registrarEvento(servico, grupoId, guarda.userId, acao, { de, para });
  atualizarTelas(grupoId);
  avisarSituacaoDaConta(grupoId, data[0].nome ?? "Uma conta", para);
  return { ok: true };
}

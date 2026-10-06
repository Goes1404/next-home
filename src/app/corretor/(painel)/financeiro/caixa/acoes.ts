"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { problemasDoLancamento, vencimentosDaSerie, type LancamentoDigitado } from "@/lib/financeiro/caixa";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";

/**
 * As ações do caixa (0166). Toda função confere o gestor antes de tocar no
 * banco (Server Action é endpoint HTTP), e a RLS confere de novo.
 */

export type ResultadoCaixa = { erro?: string; ok?: string };

const ROTA = "/corretor/financeiro/caixa";
const dataValida = (d: string | null) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function criarLancamento(l: LancamentoDigitado): Promise<ResultadoCaixa> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };

  const problemas = problemasDoLancamento(l);
  if (problemas.length > 0) return { erro: problemas[0] };

  const serie = l.repetirMeses > 1 ? crypto.randomUUID() : null;
  const hoje = hojeEmSaoPaulo();
  const linhas = vencimentosDaSerie(l.vencimento, l.repetirMeses).map((vencimento) => ({
    tipo: l.tipo,
    categoria: l.categoria,
    descricao: l.descricao.trim(),
    valor: l.valor as number,
    vencimento,
    pago_em: l.jaPago ? (vencimento > hoje ? hoje : vencimento) : null,
    recorrencia_id: serie,
    criado_por: guarda.corretor.id,
  }));

  const supabase = await createClient();
  const { error } = await supabase.from("caixa_lancamentos").insert(linhas);
  if (error) {
    console.error("[caixa] falha ao lançar:", error.message);
    return { erro: "Não foi possível salvar o lançamento agora. Tente de novo." };
  }
  revalidatePath(ROTA);
  return { ok: linhas.length > 1 ? `${linhas.length} lançamentos criados, um por mês.` : "Lançamento criado." };
}

/** Marca (ou desmarca, com `null`) como pago. */
export async function marcarLancamentoPago(id: string, data: string | null): Promise<ResultadoCaixa> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  if (!dataValida(data)) return { erro: "Data inválida." };

  const supabase = await createClient();
  const { data: linhas, error } = await supabase
    .from("caixa_lancamentos")
    .update({ pago_em: data, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error || !linhas?.length) return { erro: "Não foi possível atualizar o lançamento." };
  revalidatePath(ROTA);
  return { ok: data ? "Marcado como pago." : "Voltou para pendente." };
}

/** Exclui um lançamento, ou ele e os próximos ainda não pagos da mesma série. */
export async function excluirLancamento(id: string, escopo: "este" | "proximos"): Promise<ResultadoCaixa> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };

  const supabase = await createClient();
  const { data: alvo } = await supabase
    .from("caixa_lancamentos")
    .select("id, vencimento, recorrencia_id")
    .eq("id", id)
    .maybeSingle();
  if (!alvo) return { erro: "Lançamento não encontrado." };

  let q = supabase.from("caixa_lancamentos").delete();
  if (escopo === "proximos" && alvo.recorrencia_id) {
    // Os já pagos ficam: são história do caixa.
    q = q.eq("recorrencia_id", alvo.recorrencia_id).gte("vencimento", alvo.vencimento).is("pago_em", null);
  } else {
    q = q.eq("id", id);
  }
  const { data: apagados, error } = await q.select("id");
  if (error) return { erro: "Não foi possível excluir agora." };
  revalidatePath(ROTA);
  const n = apagados?.length ?? 0;
  return { ok: n > 1 ? `${n} lançamentos excluídos.` : "Lançamento excluído." };
}

/** O saldo da conta hoje, como está no banco do dono. */
export async function informarSaldo(valor: number): Promise<ResultadoCaixa> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  if (!Number.isFinite(valor) || Math.abs(valor) > 1_000_000_000) return { erro: "Informe o saldo em reais." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("caixa_saldos")
    .insert({ valor, informado_em: hojeEmSaoPaulo(), criado_por: guarda.corretor.id });
  if (error) return { erro: "Não foi possível salvar o saldo agora." };
  revalidatePath(ROTA);
  return { ok: "Saldo atualizado." };
}

/** Quando a construtora deve pagar a comissão da venda. */
export async function preverComissao(vendaId: string, data: string | null): Promise<ResultadoCaixa> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  if (!dataValida(data)) return { erro: "Data inválida." };

  const supabase = await createClient();
  const { data: linhas, error } = await supabase
    .from("vendas")
    .update({ comissao_prevista_em: data })
    .eq("id", vendaId)
    .select("id");
  if (error || !linhas?.length) return { erro: "Não foi possível salvar a previsão." };
  revalidatePath(ROTA);
  revalidatePath("/corretor/financeiro/extrato");
  return { ok: "Previsão salva." };
}

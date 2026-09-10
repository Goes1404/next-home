"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirGestorNaAcao } from "@/lib/guardas";
import type { ParametrosCredito } from "@/lib/credito/tipos";

/**
 * Editar os parâmetros de crédito que o consultor usa.
 *
 * A decisão de QUEM pode é de `exigirGestorNaAcao()` com o cliente de SESSÃO;
 * a função do banco confere o papel de novo e valida faixa absurda. Duas
 * conferências de propósito: a de cá dá mensagem boa, a de lá vale mesmo que
 * alguém chame o PostgREST direto.
 */
export async function salvarParametrosCredito(
  p: ParametrosCredito,
): Promise<{ ok: true } | { erro: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro) return { erro: guarda.erro };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("atualizar_parametros_credito", {
    p_faixas: p.faixas as unknown as never,
    p_teto_fgts_imovel: p.tetoFgtsImovel,
    p_taxa_sbpe_anual: p.taxaSbpeAnual,
    p_prazo_maximo_meses: p.prazoMaximoMeses,
    p_comprometimento_maximo: p.comprometimentoMaximo,
    p_itbi_por_cidade: p.itbiPorCidade as unknown as never,
    p_conferido_em: p.conferidoEm,
  });

  if (error) {
    console.error("[crédito] falha ao salvar:", error.message);
    return { erro: "Não consegui salvar. Tente de novo." };
  }
  if (data !== true) {
    return { erro: "Valor recusado. Confira taxa, prazo, comprometimento e as faixas." };
  }

  /*
   * O bloco de crédito entra no prompt a cada turno: a próxima resposta do
   * consultor já usa o número novo, sem redeploy.
   */
  revalidatePath("/corretor/admin/credito");
  revalidatePath("/corretor/consultor");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { lerValorEmReais } from "@/lib/crm/impulsionamentosCalculo";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok?: string; erro?: string };

/**
 * O corretor informa quanto gastou num impulsionamento (e, se quiser, de
 * qual imóvel era). A policy da 0127 só deixa o DONO atualizar, e o grant
 * por coluna só deixa mudar gasto e imóvel — a linha em si é do webhook.
 */
export async function salvarGastoDoImpulsionamento(params: {
  id: string;
  valor: string;
  empreendimentoId: string | null;
}): Promise<Resultado> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const valor = lerValorEmReais(params.valor);
  if (valor !== null && (Number.isNaN(valor) || valor > 1_000_000)) {
    return { erro: "Não entendi o valor. Escreva só o número, por exemplo 50 ou 49,90." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impulsionamentos")
    .update({
      valor_gasto: valor,
      gasto_informado_em: valor === null ? null : new Date().toISOString(),
      empreendimento_id: params.empreendimentoId || null,
    })
    .eq("id", params.id)
    .select("id");

  if (error) return { erro: "Não consegui salvar agora. Tente de novo." };
  // Zero linhas: o anúncio é de outro corretor (o gestor vê, mas não edita).
  if (!data?.length) return { erro: "Só quem fez o impulsionamento pode informar o gasto." };

  revalidatePath("/corretor/marketing/impulsionamentos");
  return { ok: valor === null ? "Gasto apagado." : "Gasto salvo. O custo por lead já foi recalculado." };
}

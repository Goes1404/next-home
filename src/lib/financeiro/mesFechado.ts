import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * A trava do mês fechado (0168). Mês fechado já foi para o contador: conta
 * paga, comissão recebida e repasse pago naquele mês não mudam mais até o
 * dono reabrir o mês.
 */

const faltaTabela = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";

/**
 * Algum destes dias cai num mês já fechado? Devolve o mês ("aaaa-mm") ou
 * null. Sem a tabela (antes da 0168) nada está fechado.
 */
export async function mesFechadoEntre(datas: (string | null | undefined)[]): Promise<string | null> {
  const meses = [...new Set(datas.filter((d): d is string => !!d && /^\d{4}-\d{2}/.test(d)).map((d) => `${d.slice(0, 7)}-01`))];
  if (meses.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("meses_fechados").select("mes").in("mes", meses).limit(1);
  if (error) {
    if (!faltaTabela(error)) console.error("[contador] falha ao conferir mês fechado:", error.message);
    return null;
  }
  return data?.[0]?.mes.slice(0, 7) ?? null;
}

/** Frase da recusa, igual em toda tela. */
export function recusaDeMesFechado(mes: string): string {
  const [a, m] = mes.split("-");
  return `O mês ${m}/${a} está fechado e já foi para o contador. Reabra o mês em Financeiro → Contador para mudar.`;
}

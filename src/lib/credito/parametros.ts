import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { FaixaMcmv, ParametrosCredito } from "./tipos";

/**
 * Os parâmetros de crédito, do banco.
 *
 * ## Por que existe um padrão em código
 *
 * A tabela é seedada na 0102, então a linha existe. Mas a leitura pode falhar
 * (Supabase fora do ar), e o consultor não pode ficar mudo por causa disso —
 * ele responderia sem bloco de crédito, e aí o guardrail cortaria TODA frase
 * sobre financiamento. O padrão é o mesmo seed; se um dia divergir do banco,
 * a data de conferência é o que denuncia.
 */
export const PARAMETROS_PADRAO: ParametrosCredito = {
  faixas: [
    { nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 },
    { nome: "Faixa 2", rendaMax: 4700, subsidioMaximo: 29000, taxaAnual: 0.06 },
    { nome: "Faixa 3", rendaMax: 8000, subsidioMaximo: 0, taxaAnual: 0.0766 },
    { nome: "Faixa 4", rendaMax: 12000, subsidioMaximo: 0, taxaAnual: 0.1 },
  ],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02, Osasco: 0.02, "Santana de Parnaiba": 0.02, "Sao Paulo": 0.03 },
  conferidoEm: "2026-09-09",
};

export async function getParametrosCredito(): Promise<ParametrosCredito> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parametros_credito")
    .select(
      "faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses, comprometimento_maximo, itbi_por_cidade, conferido_em",
    )
    .maybeSingle();

  if (error || !data) {
    console.warn("[crédito] falha ao ler parâmetros; usando o padrão do código:", error?.message);
    return PARAMETROS_PADRAO;
  }

  /*
   * `numeric` do Postgres chega como STRING no supabase-js — a lição do
   * orçamento do lead. Sem `Number()`, a conta do financiamento faria
   * concatenação em vez de soma e o número sairia absurdo.
   */
  return {
    faixas: (data.faixas as unknown as FaixaMcmv[]) ?? PARAMETROS_PADRAO.faixas,
    tetoFgtsImovel: Number(data.teto_fgts_imovel),
    taxaSbpeAnual: Number(data.taxa_sbpe_anual),
    prazoMaximoMeses: Number(data.prazo_maximo_meses),
    comprometimentoMaximo: Number(data.comprometimento_maximo),
    itbiPorCidade: (data.itbi_por_cidade as unknown as Record<string, number>) ?? {},
    conferidoEm: data.conferido_em,
  };
}

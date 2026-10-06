import "server-only";

import { createClient } from "@/lib/supabase/server";
import { CONFIG_PADRAO, type ConfigFiscal, type DadosFiscaisDaVenda } from "./fiscal";

/**
 * Leitura do fiscal (0167) pelo cliente de SESSÃO: a RLS só deixa o gestor.
 * `numeric` chega como string no supabase-js; a conversão mora aqui.
 */

export type LeituraFiscal =
  | {
      ok: true;
      config: ConfigFiscal;
      dados: Map<string, DadosFiscaisDaVenda>;
      vinculos: Map<string, "autonomo" | "pj">;
    }
  | { ok: false; motivo: "sem_tabela" | "erro" };

const faltaTabela = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";

export async function getFiscal(vendaIds: string[]): Promise<LeituraFiscal> {
  const supabase = await createClient();
  const [cfg, vinc, dados] = await Promise.all([
    supabase.from("fiscal_config").select("*").eq("id", 1).maybeSingle(),
    supabase.from("corretor_fiscal").select("corretor_id, vinculo"),
    vendaIds.length
      ? supabase.from("venda_fiscal").select("*").in("venda_id", vendaIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const erro = cfg.error ?? vinc.error ?? dados.error;
  if (erro) {
    if (faltaTabela(erro)) return { ok: false, motivo: "sem_tabela" };
    console.error("[fiscal] falha ao ler:", erro.message);
    return { ok: false, motivo: "erro" };
  }
  const c = cfg.data;
  const config: ConfigFiscal = c
    ? {
        regime: c.regime,
        aliquotaSimples: Number(c.aliquota_simples),
        aliquotaIss: Number(c.aliquota_iss),
        tetoInss: Number(c.teto_inss),
        cnpj: c.cnpj,
        razaoSocial: c.razao_social,
        conferidoEm: c.conferido_em,
      }
    : CONFIG_PADRAO;
  return {
    ok: true,
    config,
    vinculos: new Map((vinc.data ?? []).map((v) => [v.corretor_id, v.vinculo])),
    dados: new Map(
      (dados.data ?? []).map((d) => [
        d.venda_id,
        {
          vendaId: d.venda_id,
          compradorNome: d.comprador_nome,
          compradorDocumento: d.comprador_documento,
          vendedorNome: d.vendedor_nome,
          vendedorDocumento: d.vendedor_documento,
          notaNumero: d.nota_numero,
          notaEmitidaEm: d.nota_emitida_em,
        },
      ]),
    ),
  };
}

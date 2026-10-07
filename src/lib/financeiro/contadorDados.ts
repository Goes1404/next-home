import "server-only";

import { createClient } from "@/lib/supabase/server";
import { gerarXlsx } from "@/lib/imoveis/xlsxEscrita";
import { getFiscalDoMes } from "./fiscalDoMes";
import { abasDoPacote, totaisDoMes, type TotaisDoMes } from "./pacoteDoMes";

/**
 * O contador (0168): pacote do mês, meses fechados e acessos por link.
 * Leitura pelo cliente de SESSÃO (a RLS só deixa o gestor); a página
 * pública do contador usa a chave de serviço e não passa por aqui.
 */

export const BUCKET_CONTABILIDADE = "contabilidade";

export type MesFechado = {
  mes: string; // "aaaa-mm"
  arquivoPath: string;
  totais: Partial<TotaisDoMes>;
  fechadoEm: string;
};

export type AcessoContador = {
  token: string;
  nome: string;
  criadoEm: string;
  expiraEm: string;
  revogadoEm: string | null;
  ultimoAcessoEm: string | null;
};

const faltaTabela = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";

/** O arquivo .xlsx do mês, com os números de agora. */
export async function montarPacoteDoMes(
  mes: string,
): Promise<{ ok: true; arquivo: Buffer; totais: TotaisDoMes } | { ok: false; motivo: string }> {
  const leitura = await getFiscalDoMes(mes);
  if (!leitura.ok) {
    return { ok: false, motivo: leitura.motivo === "sem_tabela" ? "O fiscal ainda não foi ativado no banco." : "Não consegui ler os números do mês." };
  }
  const f = leitura.fiscal;
  if (!f.vendasLidas) return { ok: false, motivo: "As vendas não puderam ser lidas agora. Tente de novo." };
  const entrada = {
    mes,
    resultado: f.resultado,
    movimentos: f.movimentosDoMes,
    impostos: f.impostos,
    impostosPagos: f.impostosPagos,
    receita: f.receita,
    config: f.config,
    rpas: f.rpas,
    comissoesDoMes: f.comissoesDoMes,
    dados: f.dados,
  };
  return { ok: true, arquivo: gerarXlsx(abasDoPacote(entrada)), totais: totaisDoMes(entrada) };
}

export async function getMesesFechados(): Promise<{ ok: true; meses: MesFechado[] } | { ok: false; motivo: "sem_tabela" | "erro" }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meses_fechados")
    .select("mes, arquivo_path, totais, fechado_em")
    .order("mes", { ascending: false })
    .limit(120);
  if (error) {
    if (faltaTabela(error)) return { ok: false, motivo: "sem_tabela" };
    console.error("[contador] falha ao ler meses fechados:", error.message);
    return { ok: false, motivo: "erro" };
  }
  return {
    ok: true,
    meses: (data ?? []).map((m) => ({
      mes: m.mes.slice(0, 7),
      arquivoPath: m.arquivo_path,
      totais: (m.totais ?? {}) as Partial<TotaisDoMes>,
      fechadoEm: m.fechado_em,
    })),
  };
}

export async function getAcessosContador(): Promise<AcessoContador[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acessos_contador")
    .select("token, nome, criado_em, expira_em, revogado_em, ultimo_acesso_em")
    .order("criado_em", { ascending: false })
    .limit(50);
  if (error) {
    if (!faltaTabela(error)) console.error("[contador] falha ao ler acessos:", error.message);
    return [];
  }
  return (data ?? []).map((a) => ({
    token: a.token,
    nome: a.nome,
    criadoEm: a.criado_em,
    expiraEm: a.expira_em,
    revogadoEm: a.revogado_em,
    ultimoAcessoEm: a.ultimo_acesso_em,
  }));
}

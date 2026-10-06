import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Categoria, LancamentoDoCaixa, SaldoInformado, TipoMovimento } from "./caixa";

/**
 * Leitura do caixa (0166) pelo cliente de SESSÃO: a RLS só deixa o gestor
 * ver. `numeric` chega como string no supabase-js, então tudo passa por
 * `Number()` aqui, num lugar só.
 */

export type LeituraDoCaixa =
  | { ok: true; lancamentos: LancamentoDoCaixa[]; saldo: SaldoInformado | null }
  | { ok: false; motivo: "sem_tabela" | "erro" };

/**
 * Pendentes todos; pagos só desde o mais antigo entre o início do mês e o
 * dia do saldo informado (é o que entra no saldo de hoje e no realizado).
 */
export async function getCaixa(hoje: string): Promise<LeituraDoCaixa> {
  const supabase = await createClient();

  const { data: saldos, error: erroSaldo } = await supabase
    .from("caixa_saldos")
    .select("valor, informado_em")
    .order("informado_em", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (erroSaldo) {
    if (erroSaldo.code === "PGRST205" || erroSaldo.code === "42P01") return { ok: false, motivo: "sem_tabela" };
    console.error("[caixa] falha ao ler o saldo:", erroSaldo.message);
    return { ok: false, motivo: "erro" };
  }
  const s = saldos?.[0];
  const saldo: SaldoInformado | null = s ? { valor: Number(s.valor), informadoEm: s.informado_em } : null;

  const inicioDoMes = `${hoje.slice(0, 7)}-01`;
  const desde = saldo && saldo.informadoEm < inicioDoMes ? saldo.informadoEm : inicioDoMes;

  const colunas = "id, tipo, categoria, descricao, valor, vencimento, pago_em, recorrencia_id";
  const [pendentes, pagos] = await Promise.all([
    supabase.from("caixa_lancamentos").select(colunas).is("pago_em", null).order("vencimento").limit(1000),
    supabase.from("caixa_lancamentos").select(colunas).gte("pago_em", desde).order("pago_em").limit(1000),
  ]);
  if (pendentes.error || pagos.error) {
    console.error("[caixa] falha ao ler lançamentos:", pendentes.error?.message ?? pagos.error?.message);
    return { ok: false, motivo: "erro" };
  }

  const lancamentos = [...(pendentes.data ?? []), ...(pagos.data ?? [])].map((l) => ({
    id: l.id,
    tipo: l.tipo as TipoMovimento,
    categoria: l.categoria as Categoria,
    descricao: l.descricao,
    valor: Number(l.valor),
    vencimento: l.vencimento,
    pagoEm: l.pago_em,
    recorrenciaId: l.recorrencia_id,
  }));

  return { ok: true, lancamentos, saldo };
}

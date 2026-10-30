import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { problemasDoLancamento, type Categoria, type TipoMovimento } from "./caixa";
import { recusaDeMesFechado } from "./mesFechado";

/**
 * O caixa da imobiliária pedido pelo número central (onda 2, 30/10/2026;
 * spec do CRM pelo WhatsApp 3.7 item 26): "lança despesa de 1.200 de
 * aluguel".
 *
 * Mora no domínio, e não em `src/lib/central/`, pela mesma razão de
 * `crm/leadPeloCentral.ts`: o central só resolve o pedido e chama isto
 * depois do "sim". As regras são as de `criarLancamento` (a tela do Caixa):
 * a mesma validação (`problemasDoLancamento`), a mesma competência (o mês do
 * vencimento) e a trava do mês fechado. Só muda o cliente: aqui não há sessão,
 * a chave de serviço ignora a RLS e o grupo vai em toda leitura e escrita.
 */

type Supa = ReturnType<typeof createServiceClient>;

const faltaTabela = (e: { code?: string } | null) => e?.code === "PGRST205" || e?.code === "42P01";

/**
 * A trava do mês fechado (0168) para quem não tem sessão: `mesFechadoEntre`
 * lê pela RLS, que recorta o grupo; aqui o recorte é o `.eq("grupo_id")`.
 * Devolve a frase da recusa (a mesma de toda tela) ou null.
 */
export async function recusaDoMesFechadoNoGrupo(supabase: Supa, grupoId: string, datas: (string | null | undefined)[]): Promise<string | null> {
  const meses = [...new Set(datas.filter((d): d is string => !!d && /^\d{4}-\d{2}/.test(d)).map((d) => `${d.slice(0, 7)}-01`))];
  if (meses.length === 0) return null;
  const { data, error } = await supabase.from("meses_fechados").select("mes").eq("grupo_id", grupoId).in("mes", meses).limit(1);
  if (error) {
    // Sem a tabela (antes da 0168) nada está fechado. Outro erro também
    // deixa passar, como na tela: a trava é do contador, não do caixa.
    if (!faltaTabela(error)) console.error("[central] falha ao conferir mês fechado:", error.message);
    return null;
  }
  const mes = data?.[0]?.mes;
  return mes ? recusaDeMesFechado(mes.slice(0, 7)) : null;
}

export type LancamentoDoCentral = {
  tipo: TipoMovimento;
  categoria: Categoria;
  descricao: string;
  valor: number;
  /** "aaaa-mm-dd". */
  vencimento: string;
  /** O dia em que foi pago, ou null (conta a pagar/receber). */
  pagoEm: string | null;
};

export type LancamentoFeito =
  | { desfecho: "lancado"; lancamentoId: string; atualizadoEm: string }
  | { desfecho: "recusado"; motivo: string }
  | { desfecho: "falhou" };

/**
 * Grava UM lançamento avulso (a série mensal fica na tela: pelo WhatsApp o
 * risco de criar 12 contas erradas não compensa). `criado_por` é o gestor
 * identificado; o grupo vai explícito e o gatilho da 0191 confere com o dele.
 */
export async function lancarNoCaixaPeloCentral(
  supabase: Supa,
  p: { grupoId: string; gestorId: string; lancamento: LancamentoDoCentral },
): Promise<LancamentoFeito> {
  const l = p.lancamento;
  const problemas = problemasDoLancamento({
    tipo: l.tipo,
    categoria: l.categoria,
    descricao: l.descricao,
    valor: l.valor,
    vencimento: l.vencimento,
    jaPago: l.pagoEm !== null,
    repetirMeses: 1,
  });
  if (problemas.length > 0) return { desfecho: "recusado", motivo: problemas[0] };

  const fechado = await recusaDoMesFechadoNoGrupo(supabase, p.grupoId, [l.pagoEm]);
  if (fechado) return { desfecho: "recusado", motivo: fechado };

  const { data, error } = await supabase
    .from("caixa_lancamentos")
    .insert({
      grupo_id: p.grupoId,
      tipo: l.tipo,
      categoria: l.categoria,
      descricao: l.descricao.trim(),
      valor: l.valor,
      vencimento: l.vencimento,
      pago_em: l.pagoEm,
      recorrencia_id: null,
      competencia: `${l.vencimento.slice(0, 7)}-01`,
      criado_por: p.gestorId,
    })
    .select("id, atualizado_em")
    .single();
  if (error || !data) {
    console.error("[central] falha ao lançar no caixa:", error?.message);
    return { desfecho: "falhou" };
  }
  return { desfecho: "lancado", lancamentoId: data.id, atualizadoEm: data.atualizado_em };
}

/**
 * O "desfaz" do lançamento (spec 4.6): apaga a linha criada, como o
 * "Excluir" da tela. Só se ninguém mexeu nela depois (`atualizado_em` igual
 * ao da criação: marcar como pago na tela muda a data) e se o pagamento não
 * caiu num mês que já foi para o contador.
 */
export async function desfazerLancamentoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; lancamentoId: string; atualizadoEm: string },
): Promise<{ desfecho: "desfeito" } | { desfecho: "mudou" } | { desfecho: "recusado"; motivo: string }> {
  const { data: atual } = await supabase
    .from("caixa_lancamentos")
    .select("id, pago_em, atualizado_em")
    .eq("id", p.lancamentoId)
    .eq("grupo_id", p.grupoId)
    .maybeSingle();
  if (!atual || atual.atualizado_em !== p.atualizadoEm) return { desfecho: "mudou" };
  const fechado = await recusaDoMesFechadoNoGrupo(supabase, p.grupoId, [atual.pago_em]);
  if (fechado) return { desfecho: "recusado", motivo: fechado };

  const { data, error } = await supabase
    .from("caixa_lancamentos")
    .delete()
    .eq("id", p.lancamentoId)
    .eq("grupo_id", p.grupoId)
    .eq("atualizado_em", p.atualizadoEm)
    .select("id");
  if (error) console.error("[central] falha ao desfazer o lançamento:", error.message);
  return data?.length ? { desfecho: "desfeito" } : { desfecho: "mudou" };
}

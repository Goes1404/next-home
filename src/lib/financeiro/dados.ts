import "server-only";

import { createClient } from "@/lib/supabase/server";
import { vgvCreditado, type StatusVenda } from "./venda";

/**
 * Leitura das vendas (0114). Como no resto do painel, nenhuma consulta leva
 * `.eq("corretor_id", …)`: a RLS recorta — o corretor vê as que registrou e
 * as em que participa; o gestor vê todas.
 *
 * `numeric` do Postgres chega como STRING no supabase-js (lição da 0032), por
 * isso todo número passa por `Number()` aqui, num lugar só.
 *
 * Nomes de corretor e imóvel vêm em consultas separadas, não em embed: o
 * types.ts é mantido à mão e não declara as relações das tabelas novas.
 */

export type ParticipanteNaTela = {
  corretorId: string;
  nome: string;
  partePercentual: number;
  repassePercentual: number | null;
  repasseValor: number;
  repassePagoEm: string | null;
};

export type VendaNaTela = {
  id: string;
  registradaPor: string;
  registradaPorNome: string;
  leadId: string | null;
  leadNome: string | null;
  empreendimentoId: string | null;
  imovel: string;
  unidade: string | null;
  dataVenda: string;
  valorVenda: number;
  comissaoPercentual: number | null;
  comissaoValor: number;
  status: StatusVenda;
  distratadaEm: string | null;
  comissaoRecebidaEm: string | null;
  observacao: string | null;
  participantes: ParticipanteNaTela[];
};

export type LeituraDeVendas =
  | { ok: true; vendas: VendaNaTela[] }
  /** A 0114 ainda não foi aplicada no banco. */
  | { ok: false; motivo: "sem_tabela" | "erro" };

const COLUNAS =
  "id, corretor_id, lead_id, empreendimento_id, imovel_descricao, unidade, data_venda, valor_venda, comissao_percentual, comissao_valor, status, distratada_em, comissao_recebida_em, observacao";

type LinhaVenda = {
  id: string;
  corretor_id: string;
  lead_id: string | null;
  empreendimento_id: string | null;
  imovel_descricao: string | null;
  unidade: string | null;
  data_venda: string;
  valor_venda: number | string;
  comissao_percentual: number | string | null;
  comissao_valor: number | string;
  status: StatusVenda;
  distratada_em: string | null;
  comissao_recebida_em: string | null;
  observacao: string | null;
};

type LinhaParticipante = {
  venda_id: string;
  corretor_id: string;
  parte_percentual: number | string;
  repasse_percentual: number | string | null;
  repasse_valor: number | string;
  repasse_pago_em: string | null;
};

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

/** Tabela ou função inexistente: PostgREST responde PGRST205/42P01. */
function faltaATabela(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === "PGRST205" || erro.code === "42P01" || /vendas|does not exist/i.test(erro.message ?? "");
}

async function montar(linhas: LinhaVenda[]): Promise<VendaNaTela[]> {
  if (linhas.length === 0) return [];
  const supabase = await createClient();
  const ids = linhas.map((l) => l.id);

  const { data: parts } = await supabase
    .from("venda_participantes")
    .select("venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor, repasse_pago_em")
    .in("venda_id", ids);
  const participantes = (parts ?? []) as LinhaParticipante[];

  const idsCorretores = [...new Set([...linhas.map((l) => l.corretor_id), ...participantes.map((p) => p.corretor_id)])];
  const idsImoveis = [...new Set(linhas.map((l) => l.empreendimento_id).filter((v): v is string => Boolean(v)))];
  const idsLeads = [...new Set(linhas.map((l) => l.lead_id).filter((v): v is string => Boolean(v)))];

  const [{ data: corretores }, { data: imoveis }, { data: leads }] = await Promise.all([
    supabase.from("corretores").select("id, nome").in("id", idsCorretores),
    idsImoveis.length
      ? supabase.from("empreendimentos").select("id, nome").in("id", idsImoveis)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    idsLeads.length
      ? supabase.from("leads").select("id, nome").in("id", idsLeads)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);

  const nomeCorretor = new Map((corretores ?? []).map((c) => [c.id, c.nome as string]));
  const nomeImovel = new Map((imoveis ?? []).map((i) => [i.id, i.nome as string]));
  const nomeLead = new Map((leads ?? []).map((l) => [l.id, l.nome as string]));

  return linhas.map((l) => ({
    id: l.id,
    registradaPor: l.corretor_id,
    registradaPorNome: nomeCorretor.get(l.corretor_id) ?? "",
    leadId: l.lead_id,
    // Lead que a RLS esconde (de outro corretor) aparece sem nome, não some.
    leadNome: l.lead_id ? (nomeLead.get(l.lead_id) ?? null) : null,
    empreendimentoId: l.empreendimento_id,
    imovel: (l.empreendimento_id && nomeImovel.get(l.empreendimento_id)) || l.imovel_descricao || "Imóvel",
    unidade: l.unidade,
    dataVenda: l.data_venda,
    valorVenda: Number(l.valor_venda),
    comissaoPercentual: num(l.comissao_percentual),
    comissaoValor: Number(l.comissao_valor),
    status: l.status,
    distratadaEm: l.distratada_em,
    comissaoRecebidaEm: l.comissao_recebida_em,
    observacao: l.observacao,
    participantes: participantes
      .filter((p) => p.venda_id === l.id)
      .map((p) => ({
        corretorId: p.corretor_id,
        nome: nomeCorretor.get(p.corretor_id) ?? "",
        partePercentual: Number(p.parte_percentual),
        repassePercentual: num(p.repasse_percentual),
        repasseValor: Number(p.repasse_valor),
        repassePagoEm: p.repasse_pago_em,
      }))
      .sort((a, b) => b.partePercentual - a.partePercentual),
  }));
}

/** Teto da lista: a F1 não pagina; 200 vendas é mais que um ano da equipe hoje. */
const TETO_DA_LISTA = 200;

export async function getVendas(filtro: { inicio?: string; fim?: string } = {}): Promise<LeituraDeVendas> {
  const supabase = await createClient();
  let q = supabase.from("vendas").select(COLUNAS).order("data_venda", { ascending: false }).limit(TETO_DA_LISTA);
  if (filtro.inicio) q = q.gte("data_venda", filtro.inicio);
  if (filtro.fim) q = q.lte("data_venda", filtro.fim);
  const { data, error } = await q;
  if (error) {
    if (faltaATabela(error)) return { ok: false, motivo: "sem_tabela" };
    console.error("[vendas] falha ao listar:", error.message);
    return { ok: false, motivo: "erro" };
  }
  return { ok: true, vendas: await montar((data ?? []) as LinhaVenda[]) };
}

export async function getVenda(id: string): Promise<VendaNaTela | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vendas").select(COLUNAS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const [venda] = await montar([data as LinhaVenda]);
  return venda ?? null;
}

/** As vendas ligadas a um lead, para a ficha. Sem a 0114, lista vazia. */
export async function getVendasDoLead(leadId: string): Promise<VendaNaTela[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendas")
    .select(COLUNAS)
    .eq("lead_id", leadId)
    .order("data_venda", { ascending: false });
  if (error) return [];
  return montar((data ?? []) as LinhaVenda[]);
}

/**
 * O último repasse (% da comissão) que este corretor usou, para a tela já
 * vir preenchida. A comissão muda por venda, mas o repasse de cada corretor
 * costuma se repetir — e o campo continua editável.
 */
export async function getUltimoRepasse(corretorId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data: parts, error } = await supabase
    .from("venda_participantes")
    .select("venda_id, repasse_percentual")
    .eq("corretor_id", corretorId)
    .not("repasse_percentual", "is", null)
    .limit(100);
  if (error || !parts || parts.length === 0) return null;

  // Sem embed (o types.ts não declara a relação): a venda mais recente dele,
  // numa segunda consulta.
  const { data: recente } = await supabase
    .from("vendas")
    .select("id")
    .in("id", parts.map((p) => p.venda_id))
    .order("data_venda", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const escolhida = parts.find((p) => p.venda_id === recente?.id) ?? parts[0];
  return num(escolhida.repasse_percentual);
}

/** O VGV que conta para cada corretor numa lista de vendas. */
export function vgvPorCorretor(vendas: VendaNaTela[]): Map<string, number> {
  const total = new Map<string, number>();
  for (const v of vendas) {
    for (const p of v.participantes) {
      total.set(p.corretorId, (total.get(p.corretorId) ?? 0) + vgvCreditado(v, p.partePercentual));
    }
  }
  return total;
}

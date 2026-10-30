import { ETAPAS_DE_VISITA_EM_DIANTE as VISITA_EM_DIANTE } from "@/lib/types";
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { FormaRecebimento, Pagador, Parcela } from "./parcelas";
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
 *
 * ## Sem sessão (número central, 30/10/2026)
 *
 * O central roda com a chave de serviço, que ignora a RLS e enxerga todos os
 * grupos. Por isso as leituras têm um miolo (`lerVendas`, `lerMeta`,
 * `lerLeadsLeves`, `lerTaxasDaEquipe`) que recebe o cliente e um `Recorte`
 * — o grupo e, para o corretor, ele mesmo —, e refaz à mão o que a RLS
 * recortava calada. As funções `get*` do painel só passam o cliente da
 * sessão, sem recorte: para o painel nada muda.
 */

type Cliente = SupabaseClient<Database>;

/**
 * O que a RLS recortava, explícito para quem lê sem sessão: o grupo sempre;
 * `corretorId` quando quem pergunta é corretor (o gestor vê o grupo todo).
 */
export type Recorte = { grupoId: string; corretorId?: string | null };

export type ParticipanteNaTela = {
  corretorId: string;
  nome: string;
  partePercentual: number;
  repassePercentual: number | null;
  repasseValor: number;
  repassePagoEm: string | null;
  formaRecebimento: FormaRecebimento;
};

export type VendaNaTela = {
  id: string;
  registradaPor: string;
  registradaPorNome: string;
  leadId: string | null;
  leadNome: string | null;
  empreendimentoId: string | null;
  imovel: string;
  /** Quem paga a comissão da imobiliária. */
  construtora: string | null;
  unidade: string | null;
  dataVenda: string;
  valorVenda: number;
  comissaoPercentual: number | null;
  comissaoValor: number;
  status: StatusVenda;
  distratadaEm: string | null;
  distratoMotivo: string | null;
  distratoParcelas: "manter" | "cancelar" | null;
  /** Um corretor avisou o distrato e o gestor ainda não decidiu (0232). */
  distratoAvisadoEm: string | null;
  distratoAviso: string | null;
  /** O que a imobiliária recebe, parcela por parcela, em ordem (0232). */
  parcelas: Parcela[];
  observacao: string | null;
  participantes: ParticipanteNaTela[];
};

export type LeituraDeVendas =
  | { ok: true; vendas: VendaNaTela[] }
  /** A 0114 ainda não foi aplicada no banco. */
  | { ok: false; motivo: "sem_tabela" | "erro" };

const COLUNAS =
  "id, corretor_id, lead_id, empreendimento_id, imovel_descricao, unidade, data_venda, valor_venda, comissao_percentual, comissao_valor, status, distratada_em, distrato_motivo, distrato_parcelas, distrato_avisado_em, distrato_aviso, observacao";

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
  distrato_motivo: string | null;
  distrato_parcelas: "manter" | "cancelar" | null;
  distrato_avisado_em: string | null;
  distrato_aviso: string | null;
  observacao: string | null;
};

type LinhaParticipante = {
  venda_id: string;
  corretor_id: string;
  parte_percentual: number | string;
  repasse_percentual: number | string | null;
  repasse_valor: number | string;
  repasse_pago_em: string | null;
  forma_recebimento: FormaRecebimento;
};

type LinhaParcela = {
  id: string;
  venda_id: string;
  numero: number;
  valor: number | string;
  pagador: Pagador;
  vence_em: string | null;
  recebida_em: string | null;
  cancelada_em: string | null;
};

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

/** Tabela ou função inexistente: PostgREST responde PGRST205/42P01. */
function faltaATabela(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  return erro.code === "PGRST205" || erro.code === "42P01" || /vendas|does not exist/i.test(erro.message ?? "");
}

async function montar(linhas: LinhaVenda[]): Promise<VendaNaTela[]> {
  return montarCom(await createClient(), linhas);
}

/**
 * Participantes, parcelas e nomes das vendas já lidas. Com `recorte` (sem
 * sessão), toda leitura filtra o grupo, e o nome do lead só vem dos leads do
 * corretor quando quem pergunta é corretor: é o que a RLS de `leads` mostra
 * a ele.
 */
async function montarCom(supabase: Cliente, linhas: LinhaVenda[], recorte?: Recorte): Promise<VendaNaTela[]> {
  if (linhas.length === 0) return [];
  const ids = linhas.map((l) => l.id);
  const doGrupo = <Q extends { eq(coluna: "grupo_id", valor: string): Q }>(q: Q): Q =>
    recorte ? q.eq("grupo_id", recorte.grupoId) : q;

  const [{ data: parts }, { data: pcs }] = await Promise.all([
    doGrupo(
      supabase
        .from("venda_participantes")
        .select("venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor, repasse_pago_em, forma_recebimento")
        .in("venda_id", ids),
    ),
    doGrupo(
      supabase
        .from("venda_parcelas")
        .select("id, venda_id, numero, valor, pagador, vence_em, recebida_em, cancelada_em")
        .in("venda_id", ids),
    ).order("numero"),
  ]);
  const participantes = (parts ?? []) as LinhaParticipante[];
  const parcelas = (pcs ?? []) as LinhaParcela[];

  const idsCorretores = [...new Set([...linhas.map((l) => l.corretor_id), ...participantes.map((p) => p.corretor_id)])];
  const idsImoveis = [...new Set(linhas.map((l) => l.empreendimento_id).filter((v): v is string => Boolean(v)))];
  const idsLeads = [...new Set(linhas.map((l) => l.lead_id).filter((v): v is string => Boolean(v)))];

  const leadsVisiveis = () => {
    const q = doGrupo(supabase.from("leads").select("id, nome").in("id", idsLeads));
    return recorte?.corretorId ? q.eq("corretor_id", recorte.corretorId) : q;
  };
  const [{ data: corretores }, { data: imoveis }, { data: leads }] = await Promise.all([
    doGrupo(supabase.from("corretores").select("id, nome").in("id", idsCorretores)),
    idsImoveis.length
      ? doGrupo(supabase.from("empreendimentos").select("id, nome, construtora").in("id", idsImoveis))
      : Promise.resolve({ data: [] as { id: string; nome: string; construtora: string | null }[] }),
    idsLeads.length ? leadsVisiveis() : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);

  const nomeCorretor = new Map((corretores ?? []).map((c) => [c.id, c.nome as string]));
  const nomeImovel = new Map((imoveis ?? []).map((i) => [i.id, i.nome as string]));
  const construtoraDe = new Map((imoveis ?? []).map((i) => [i.id, (i.construtora as string | null) ?? null]));
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
    construtora: l.empreendimento_id ? (construtoraDe.get(l.empreendimento_id) ?? null) : null,
    unidade: l.unidade,
    dataVenda: l.data_venda,
    valorVenda: Number(l.valor_venda),
    comissaoPercentual: num(l.comissao_percentual),
    comissaoValor: Number(l.comissao_valor),
    status: l.status,
    distratadaEm: l.distratada_em,
    distratoMotivo: l.distrato_motivo,
    distratoParcelas: l.distrato_parcelas,
    distratoAvisadoEm: l.distrato_avisado_em,
    distratoAviso: l.distrato_aviso,
    parcelas: parcelas
      .filter((pc) => pc.venda_id === l.id)
      .map((pc) => ({
        id: pc.id,
        numero: Number(pc.numero),
        valor: Number(pc.valor),
        pagador: pc.pagador,
        venceEm: pc.vence_em,
        recebidaEm: pc.recebida_em,
        canceladaEm: pc.cancelada_em,
      })),
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
        formaRecebimento: p.forma_recebimento ?? "repasse",
      }))
      .sort((a, b) => b.partePercentual - a.partePercentual),
  }));
}

/** Teto da lista: a F1 não pagina; 200 vendas é mais que um ano da equipe hoje. */
const TETO_DA_LISTA = 200;

export async function getVendas(filtro: { inicio?: string; fim?: string } = {}): Promise<LeituraDeVendas> {
  return lerVendas(await createClient(), filtro);
}

/**
 * O miolo de `getVendas`, com o cliente por parâmetro. Com `recorte` (sem
 * sessão), refaz a policy de SELECT de `vendas` (0114): o gestor vê as do
 * grupo; o corretor, as que registrou e as em que participa. O teto de 200
 * vale depois do recorte, como com a RLS.
 */
export async function lerVendas(
  supabase: Cliente,
  filtro: { inicio?: string; fim?: string } = {},
  recorte?: Recorte,
): Promise<LeituraDeVendas> {
  let q = supabase.from("vendas").select(COLUNAS).order("data_venda", { ascending: false }).limit(TETO_DA_LISTA);
  if (filtro.inicio) q = q.gte("data_venda", filtro.inicio);
  if (filtro.fim) q = q.lte("data_venda", filtro.fim);
  if (recorte) {
    q = q.eq("grupo_id", recorte.grupoId);
    if (recorte.corretorId) {
      // "Participa?" é a `participa_da_venda` da policy, feita aqui em duas leituras.
      const { data: minhas, error } = await supabase
        .from("venda_participantes")
        .select("venda_id")
        .eq("grupo_id", recorte.grupoId)
        .eq("corretor_id", recorte.corretorId)
        .limit(1000);
      if (error) {
        if (faltaATabela(error)) return { ok: false, motivo: "sem_tabela" };
        console.error("[vendas] falha ao listar participações:", error.message);
        return { ok: false, motivo: "erro" };
      }
      const ids = [...new Set((minhas ?? []).map((m) => m.venda_id))];
      q = ids.length
        ? q.or(`corretor_id.eq.${recorte.corretorId},id.in.(${ids.join(",")})`)
        : q.eq("corretor_id", recorte.corretorId);
    }
  }
  const { data, error } = await q;
  if (error) {
    if (faltaATabela(error)) return { ok: false, motivo: "sem_tabela" };
    console.error("[vendas] falha ao listar:", error.message);
    return { ok: false, motivo: "erro" };
  }
  return { ok: true, vendas: await montarCom(supabase, (data ?? []) as LinhaVenda[], recorte) };
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

// ─── F2 a F8 (0115) ─────────────────────────────────────────────────────

export type LinhaDoRanking = {
  corretorId: string;
  nome: string;
  fotoUrl: string | null;
  vgv: number;
  vendas: number;
  distratos: number;
};

/** Ranking de VGV que todos veem. `null` quando a 0115 não está aplicada. */
export async function getRankingVgv(inicio: string, fim: string): Promise<LinhaDoRanking[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ranking_vgv", { p_inicio: inicio, p_fim: fim });
  if (error) {
    if (!faltaATabela(error) && !/ranking_vgv/.test(error.message)) console.error("[ranking] falha:", error.message);
    return null;
  }
  return (data ?? []).map((r) => ({
    corretorId: r.corretor_id,
    nome: r.nome,
    fotoUrl: r.foto_url,
    vgv: Number(r.vgv),
    vendas: Number(r.vendas),
    distratos: Number(r.distratos),
  }));
}

export type TaxasDaEquipe = {
  leads: number;
  visitas: number;
  vendas: number;
  repasseMedio: number | null;
  ticketMedio: number | null;
  docParaVenda: number | null;
};

/**
 * As taxas da equipe SEM sessão: a `taxas_da_equipe` (0192) recusa quem não
 * tem sessão (`sem_sessao`), e é ela que a meta usa como reserva quando o
 * corretor ainda não tem histórico. Mesma conta da função, em duas leituras
 * do grupo: leads desde `desde` (visita = data marcada ou etapa de visita em
 * diante) e vendas ativas desde `desde`, com o repasse médio dos
 * participantes. Mudou a função no banco, muda aqui (teste em
 * `src/lib/central/tratadores/relatorios.test.ts`).
 */
export async function lerTaxasDaEquipe(supabase: Cliente, grupoId: string, desde: string): Promise<TaxasDaEquipe | null> {
  const [{ data: leads, error: erroLeads }, { data: vendas, error: erroVendas }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, visita_agendada_em, etapa")
      .eq("grupo_id", grupoId)
      .gte("created_at", desde)
      .limit(TETO_DE_LEADS),
    supabase
      .from("vendas")
      .select("id, valor_venda")
      .eq("grupo_id", grupoId)
      .eq("status", "ativa")
      .gte("data_venda", desde)
      .limit(TETO_DE_LEADS),
  ]);
  if (erroLeads || erroVendas) return null;
  const ids = (vendas ?? []).map((v) => v.id);
  const { data: parts } = ids.length
    ? await supabase.from("venda_participantes").select("repasse_valor").eq("grupo_id", grupoId).in("venda_id", ids)
    : { data: [] as { repasse_valor: number | string }[] };

  const media = (ns: number[], casas: number) =>
    ns.length ? Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 10 ** casas) / 10 ** casas : null;
  const ls = leads ?? [];
  const avancados = ls.filter((l) => ["proposta", "documentacao", "fechado"].includes(l.etapa));
  return {
    leads: ls.length,
    visitas: ls.filter((l) => l.visita_agendada_em !== null || ETAPAS_DE_VISITA.has(l.etapa)).length,
    vendas: ids.length,
    repasseMedio: media((parts ?? []).map((p) => Number(p.repasse_valor)), 2),
    ticketMedio: media((vendas ?? []).map((v) => Number(v.valor_venda)), 2),
    docParaVenda: avancados.length ? Math.round((avancados.filter((l) => l.etapa === "fechado").length / avancados.length) * 10_000) / 10_000 : null,
  };
}

export async function getTaxasDaEquipe(desde: string): Promise<TaxasDaEquipe | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("taxas_da_equipe", { p_desde: desde });
  if (error || !data || data.length === 0) return null;
  const r = data[0];
  return {
    leads: Number(r.leads),
    visitas: Number(r.visitas),
    vendas: Number(r.vendas),
    repasseMedio: num(r.repasse_medio),
    ticketMedio: num(r.ticket_medio),
    docParaVenda: num(r.doc_para_venda),
  };
}

export type MetaDoMes = { metaComissao: number; comissaoPorVenda: number | null };

/**
 * A meta do mês. Sem linha no mês, herda a ESTIMATIVA de comissão por venda
 * do mês mais recente: o valor de uma venda não muda porque o mês virou.
 */
export type LeituraDaMeta = { meta: MetaDoMes | null; estimativaAnterior: number | null };

export async function getMeta(corretorId: string, mes: string): Promise<LeituraDaMeta | null> {
  return lerMeta(await createClient(), corretorId, mes);
}

/** O miolo de `getMeta`; com `grupoId` (sem sessão), a leitura fica no grupo. */
export async function lerMeta(
  supabase: Cliente,
  corretorId: string,
  mes: string,
  grupoId?: string,
): Promise<LeituraDaMeta | null> {
  let q = supabase
    .from("metas_corretor")
    .select("mes, meta_comissao, comissao_por_venda")
    .eq("corretor_id", corretorId)
    .lte("mes", mes);
  if (grupoId) q = q.eq("grupo_id", grupoId);
  const { data, error } = await q.order("mes", { ascending: false }).limit(6);
  if (error) return null;
  const linhas = data ?? [];
  const doMes = linhas.find((l) => l.mes === mes);
  const estimativaAnterior = num(linhas.find((l) => l.comissao_por_venda !== null)?.comissao_por_venda ?? null);
  return {
    meta: doMes
      ? { metaComissao: Number(doMes.meta_comissao), comissaoPorVenda: num(doMes.comissao_por_venda) }
      : null,
    estimativaAnterior,
  };
}

export type LeadLeve = {
  id: string;
  corretorId: string | null;
  imovelId: string | null;
  criadoEm: string;
  visitou: boolean;
  etapa: string;
};

const ETAPAS_DE_VISITA = new Set<string>(VISITA_EM_DIANTE);

/** Teto da leitura de leads do desempenho: ~100 por corretor hoje. */
const TETO_DE_LEADS = 5000;

/**
 * Leads numa forma magra, para contar desempenho. Arquivado entra: ele foi
 * atendido do mesmo jeito. O imóvel é o assunto da conversa e, na falta,
 * o de origem.
 */
export async function getLeadsLeves(desde: string): Promise<LeadLeve[]> {
  return lerLeadsLeves(await createClient(), desde);
}

/**
 * O miolo de `getLeadsLeves`. Com `recorte` (sem sessão): o grupo, e o
 * corretor quando é ele quem pergunta (a RLS de `leads` mostra a ele só os
 * dele). `ate` (exclusivo) fecha o período no banco: com `desde` e `ate` no
 * horário de São Paulo, conta o mês de São Paulo.
 */
export async function lerLeadsLeves(
  supabase: Cliente,
  desde: string,
  recorte?: Recorte & { ate?: string },
): Promise<LeadLeve[]> {
  let q = supabase
    .from("leads")
    .select("id, corretor_id, empreendimento_id, imovel_interesse_id, created_at, visita_agendada_em, etapa")
    .gte("created_at", desde);
  if (recorte) {
    q = q.eq("grupo_id", recorte.grupoId);
    if (recorte.corretorId) q = q.eq("corretor_id", recorte.corretorId);
    if (recorte.ate) q = q.lt("created_at", recorte.ate);
  }
  const { data } = await q.order("created_at", { ascending: false }).limit(TETO_DE_LEADS);
  return (data ?? []).map((l) => ({
    id: l.id,
    corretorId: l.corretor_id,
    imovelId: l.imovel_interesse_id ?? l.empreendimento_id ?? null,
    criadoEm: String(l.created_at).slice(0, 10),
    visitou: Boolean(l.visita_agendada_em) || ETAPAS_DE_VISITA.has(l.etapa),
    etapa: l.etapa,
  }));
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { NADA_FEITO, visitaConta, type Contagem, type MetasDoMes } from "./placarDaEquipe";

/**
 * O que o placar do mês lê do banco (0246, 29/10/2026). As metas e as
 * visitas moram em tabelas fechadas ao painel (só a chave de serviço, como
 * toda tabela nova desde a 0224), e as propostas saem do histórico de etapa
 * (`lead_interacoes` tipo `etapa`), que a RLS recorta por carteira. Por isso
 * a chave — e por isso TODA leitura daqui filtra o grupo de quem chama
 * (`servicoComGrupo.test.ts`, categoria "equipe").
 *
 * O que vai à tela é contagem por corretor; quem vê os números crus de quem
 * é decidido em `placarDoCorretor` (o corretor comum só vê o pódio).
 *
 * Sem a 0246 aplicada, `lerMetasDoMes` devolve `null` e a tela some com o
 * placar em vez de quebrar.
 */

/** Início do mês "aaaa-mm-01" e do seguinte, em São Paulo (sem horário de verão desde 2019). */
export function limitesDoMes(mes: string): { desde: string; ate: string } {
  const [a, m] = mes.split("-").map(Number);
  const seguinte = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { desde: `${mes.slice(0, 10)}T00:00:00-03:00`, ate: `${seguinte}T00:00:00-03:00` };
}

export async function lerMetasDoMes(grupoId: string, mes: string): Promise<Map<string, MetasDoMes> | null> {
  const { data, error } = await createServiceClient()
    .from("metas_da_equipe")
    .select("corretor_id, meta_visitas, meta_propostas, meta_vendas")
    .eq("grupo_id", grupoId)
    .eq("mes", mes);
  if (error) {
    // Tabela ausente (0246 ainda não aplicada) é o caso esperado; o resto vai ao log.
    if (!/metas_da_equipe/.test(error.message)) console.error("[metas da equipe] leitura falhou:", error.message);
    return null;
  }
  return new Map(
    (data ?? []).map((l) => [
      l.corretor_id,
      { visitas: l.meta_visitas, propostas: l.meta_propostas, vendas: l.meta_vendas },
    ]),
  );
}

/**
 * Visitas e propostas do mês por corretor. As vendas vêm de fora (o ranking
 * de VGV, `ranking_vgv`), para o placar e o ranking contarem a MESMA venda.
 *
 * - Visita conta para quem a FAZ (`visitas.corretor_id`), pela régua de
 *   `visitaConta`.
 * - Proposta conta para o dono ATUAL do lead que entrou na etapa Proposta no
 *   mês (um lead conta uma vez, mesmo indo e voltando).
 */
export async function lerFeitosDoMes(
  grupoId: string,
  mes: string,
  vendasPorCorretor: ReadonlyMap<string, number>,
  agora: Date = new Date(),
): Promise<Map<string, Contagem>> {
  const { desde, ate } = limitesDoMes(mes);
  const supabase = createServiceClient();
  const [{ data: visitas }, { data: etapas }] = await Promise.all([
    supabase
      .from("visitas")
      .select("corretor_id, inicio, status")
      .eq("grupo_id", grupoId)
      .gte("inicio", desde)
      .lt("inicio", ate)
      .in("status", ["marcada", "realizada"])
      .limit(5000),
    supabase
      .from("lead_interacoes")
      .select("lead_id, detalhes")
      .eq("grupo_id", grupoId)
      .eq("tipo", "etapa")
      .gte("created_at", desde)
      .lt("created_at", ate)
      .limit(5000),
  ]);

  const feitos = new Map<string, Contagem>();
  const de = (id: string) => {
    let c = feitos.get(id);
    if (!c) feitos.set(id, (c = { ...NADA_FEITO }));
    return c;
  };

  for (const v of visitas ?? []) if (visitaConta(v, agora)) de(v.corretor_id).visitas++;

  const leadsComProposta = [
    ...new Set(
      (etapas ?? [])
        .filter((e) => (e.detalhes as { para?: unknown } | null)?.para === "proposta")
        .map((e) => e.lead_id),
    ),
  ];
  if (leadsComProposta.length > 0) {
    const { data: donos } = await supabase
      .from("leads")
      .select("id, corretor_id")
      .eq("grupo_id", grupoId)
      .in("id", leadsComProposta);
    for (const l of donos ?? []) if (l.corretor_id) de(l.corretor_id).propostas++;
  }

  for (const [id, n] of vendasPorCorretor) if (n > 0) de(id).vendas = n;
  return feitos;
}

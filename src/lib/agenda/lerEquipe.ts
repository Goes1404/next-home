import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { DadosDoPreparo } from "@/lib/crm/preparoDaVisita";
import { limitesDoDia, limitesDoMes, mesDoDia, diaEmSaoPaulo, type Dia, type Mes } from "./calendario";
import { MAXIMO_POR_DIA, contarPorDia } from "./itens";
import { SELECT_VISITA, itemDaVisita, type LinhaVisita, type VisitaDoItem } from "./linhaDaVisita";
import { lerCompromissos, type ItemCompromisso } from "./compromissos";
import { MESES_DA_SERIE, mesesAteh, montarSerie, type MesDaSerie } from "./numeros";

/**
 * A Agenda da EQUIPE, para o gestor (27/10/2026, fase 2). `visitas` é
 * fechada ao painel; tudo aqui lê pela chave de serviço e filtra o grupo da
 * sessão no mesmo encadeamento. Quem chama confere o papel (gestor) antes;
 * `corretorId` nulo = equipe toda, senão o filtro por quem FAZ a visita.
 */
type RecorteDaEquipe = { grupoId: string; corretorId: string | null };

/** Para o gestor também conta a falta: é número do mês. A cancelada sai. */
const STATUS_DA_EQUIPE = ["marcada", "realizada", "faltou", "sem_confirmacao"];

const TETO_DO_MES = 2000;

function visitasDaEquipe(r: RecorteDaEquipe, inicio: Date, fim: Date) {
  let consulta = createServiceClient()
    .from("visitas")
    .select(SELECT_VISITA, { count: "exact" })
    .eq("grupo_id", r.grupoId)
    .in("status", STATUS_DA_EQUIPE)
    .gte("inicio", inicio.toISOString())
    .lt("inicio", fim.toISOString());
  if (r.corretorId) consulta = consulta.eq("corretor_id", r.corretorId);
  return consulta.order("inicio", { ascending: true });
}

export async function lerMarcadoresDaEquipe(
  p: RecorteDaEquipe & { mes: Mes },
): Promise<Record<Dia, number>> {
  const { inicio, fim } = limitesDoMes(p.mes);
  const [{ data, error }, compromissos] = await Promise.all([
    visitasDaEquipe(p, inicio, fim).limit(TETO_DO_MES),
    lerCompromissos({ grupoId: p.grupoId, equipe: true, corretorId: p.corretorId, inicio, fim, limite: TETO_DO_MES }),
  ]);
  if (error) throw new Error(`Falha ao ler o mês da equipe: ${error.message}`);
  return contarPorDia([
    ...((data ?? []) as unknown as LinhaVisita[]).flatMap((v) => (itemDaVisita(v) ? [v.inicio] : [])),
    ...compromissos.map((c) => c.inicio),
  ]);
}

/** Reuniões e bloqueios ("ocupado") da equipe no dia. */
export async function lerCompromissosDoDiaDaEquipe(
  p: RecorteDaEquipe & { dia: Dia },
): Promise<ItemCompromisso[]> {
  const { inicio, fim } = limitesDoDia(p.dia);
  return lerCompromissos({ grupoId: p.grupoId, equipe: true, corretorId: p.corretorId, inicio, fim, limite: MAXIMO_POR_DIA });
}

export async function lerDiaDaEquipe(
  p: RecorteDaEquipe & { dia: Dia },
): Promise<{ itens: VisitaDoItem[]; total: number }> {
  const { inicio, fim } = limitesDoDia(p.dia);
  const { data, error, count } = await visitasDaEquipe(p, inicio, fim).limit(MAXIMO_POR_DIA);
  if (error) throw new Error(`Falha ao ler o dia da equipe: ${error.message}`);
  const itens = ((data ?? []) as unknown as LinhaVisita[]).map(itemDaVisita).filter((v) => v !== null);
  return { itens, total: Math.max(count ?? itens.length, itens.length) };
}

export type SerieDeNumeros = { serie: MesDaSerie[]; medidaDesde: Mes | null };

export async function lerNumerosDaAgenda(p: RecorteDaEquipe & { mes: Mes }): Promise<SerieDeNumeros> {
  const meses = mesesAteh(p.mes, MESES_DA_SERIE);
  const supabase = createServiceClient();
  const [numeros, primeira] = await Promise.all([
    supabase.rpc("numeros_da_agenda", {
      p_grupo: p.grupoId,
      p_corretor: p.corretorId,
      p_de: `${meses[0]}-01`,
      p_ate: `${p.mes}-01`,
    }),
    // A Agenda conta do mês em que a primeira visita do grupo entrou nela.
    supabase
      .from("visitas")
      .select("created_at")
      .eq("grupo_id", p.grupoId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);
  if (numeros.error) throw new Error(`Falha ao ler os números da agenda: ${numeros.error.message}`);
  if (primeira.error) throw new Error(`Falha ao ler o começo da agenda: ${primeira.error.message}`);
  const medidaDesde = primeira.data ? mesDoDia(diaEmSaoPaulo(new Date(primeira.data.created_at))) : null;
  const linhas = (numeros.data ?? []).map((l) => ({
    mes: l.mes.slice(0, 7),
    marcadas: l.marcadas,
    realizadas: l.realizadas,
    faltas: l.faltas,
    semConfirmacao: l.sem_confirmacao,
    negocios: l.negocios,
  }));
  return { serie: montarSerie(linhas, meses, medidaDesde), medidaDesde };
}

const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * O PREPARO da visita (o que o cliente procura, a objeção aberta) pela chave
 * de serviço, para ids que quem chama JÁ autorizou (leu da agenda dele). A
 * leitura pela sessão não serve à visita passada: o lead não é de quem a
 * faz, e a RLS de `leads` o esconde. `numeric` chega como string no
 * supabase-js: sem o `Number`, a moeda sai quebrada sem erro.
 */
export async function lerPreparo(grupoId: string, leadIds: string[]): Promise<Map<string, DadosDoPreparo>> {
  const preparo = new Map<string, DadosDoPreparo>();
  if (leadIds.length === 0) return preparo;
  const supabase = createServiceClient();
  const [{ data: perfis }, { data: dossies }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, regiao_interesse, dormitorios_min, orcamento_min, orcamento_max, renda_mensal")
      .eq("grupo_id", grupoId)
      .in("id", leadIds),
    supabase
      .from("lead_observacoes_ia")
      .select("lead_id, resumo_executivo, objecoes_identificadas")
      .eq("grupo_id", grupoId)
      .in("lead_id", leadIds),
  ]);
  for (const p of perfis ?? []) {
    preparo.set(p.id, {
      regiaoInteresse: p.regiao_interesse,
      dormitoriosMin: numero(p.dormitorios_min),
      orcamentoMin: numero(p.orcamento_min),
      orcamentoMax: numero(p.orcamento_max),
      rendaMensal: numero(p.renda_mensal),
    });
  }
  for (const d of dossies ?? []) {
    preparo.set(d.lead_id, {
      ...(preparo.get(d.lead_id) ?? {}),
      resumoExecutivo: d.resumo_executivo,
      objecoes: Array.isArray(d.objecoes_identificadas)
        ? d.objecoes_identificadas.filter((o): o is string => typeof o === "string")
        : null,
    });
  }
  return preparo;
}

import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { limitesDoDia, limitesDoMes, type Dia, type Mes } from "./calendario";
import { MAXIMO_POR_DIA, contarPorDia, ordenarItens, type ItemDaAgenda } from "./itens";

/**
 * A Agenda do próprio corretor: visitas (0222), tarefas da ficha (0032) e
 * lembretes de anotação (0100).
 *
 * `visitas` é fechada ao painel (só a chave de serviço), então tudo aqui lê
 * pela chave — e por isso cada leitura filtra o grupo E o corretor da sessão
 * no mesmo encadeamento. Quem chama passa ids já conferidos pela sessão
 * (`getCorretorLogado`); nada aqui aceita id vindo do navegador.
 */

type Recorte = { corretorId: string; grupoId: string };

/** Visitas que contam na agenda: a desmarcada e a de cliente que faltou saem. */
const STATUS_NA_AGENDA = ["marcada", "realizada", "sem_confirmacao"];

/** Teto de cada fonte no mês: os marcadores só precisam do instante. */
const TETO_DO_MES = 1000;

type LinhaVisita = {
  id: string;
  inicio: string;
  lead_id: string;
  lead: {
    nome: string;
    telefone: string | null;
    arquivado_em: string | null;
    visita_agendada_em: string | null;
    visita_confirmada_em: string | null;
    empreendimento: { nome: string; endereco: string | null } | null;
  } | null;
};

const SELECT_VISITA = `id, inicio, lead_id,
  lead:leads!visitas_lead_id_fkey(nome, telefone, arquivado_em, visita_agendada_em, visita_confirmada_em,
    empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome, endereco))`;

function itemDaVisita(v: LinhaVisita): Extract<ItemDaAgenda, { tipo: "visita" }> | null {
  if (!v.lead || v.lead.arquivado_em) return null;
  // O "confirmo" do cliente (0123) é do lead: vale só para a visita que é a atual dele.
  const ehAtual = v.lead.visita_agendada_em !== null && Date.parse(v.lead.visita_agendada_em) === Date.parse(v.inicio);
  return {
    tipo: "visita",
    id: v.id,
    inicio: v.inicio,
    leadId: v.lead_id,
    nome: v.lead.nome,
    telefone: v.lead.telefone,
    imovel: v.lead.empreendimento,
    confirmadaPeloCliente: ehAtual && v.lead.visita_confirmada_em !== null,
  };
}

async function visitasEntre(r: Recorte, inicio: Date, fim: Date, limite: number) {
  const { data, error } = await createServiceClient()
    .from("visitas")
    .select(SELECT_VISITA)
    .eq("grupo_id", r.grupoId)
    .eq("corretor_id", r.corretorId)
    .in("status", STATUS_NA_AGENDA)
    .gte("inicio", inicio.toISOString())
    .lt("inicio", fim.toISOString())
    .order("inicio", { ascending: true })
    .limit(limite);
  if (error) throw new Error(`Falha ao ler as visitas da agenda: ${error.message}`);
  return ((data ?? []) as unknown as LinhaVisita[]).map(itemDaVisita).filter((v) => v !== null);
}

export async function lerMarcadoresDoMes(p: Recorte & { mes: Mes }): Promise<Record<Dia, number>> {
  const { inicio, fim } = limitesDoMes(p.mes);
  const supabase = createServiceClient();
  const [visitas, tarefas, lembretes] = await Promise.all([
    supabase
      .from("visitas")
      .select("inicio, lead:leads!visitas_lead_id_fkey(arquivado_em)")
      .eq("grupo_id", p.grupoId)
      .eq("corretor_id", p.corretorId)
      .in("status", STATUS_NA_AGENDA)
      .gte("inicio", inicio.toISOString())
      .lt("inicio", fim.toISOString())
      .limit(TETO_DO_MES),
    supabase
      .from("lead_tarefas")
      .select("prazo")
      .eq("grupo_id", p.grupoId)
      .eq("corretor_id", p.corretorId)
      .is("concluida_em", null)
      .gte("prazo", inicio.toISOString())
      .lt("prazo", fim.toISOString())
      .limit(TETO_DO_MES),
    supabase
      .from("anotacoes")
      .select("lembrete_em")
      .eq("grupo_id", p.grupoId)
      .eq("destinatario_id", p.corretorId)
      .is("concluida_em", null)
      .gte("lembrete_em", inicio.toISOString())
      .lt("lembrete_em", fim.toISOString())
      .limit(TETO_DO_MES),
  ]);
  for (const r of [visitas, tarefas, lembretes]) {
    if (r.error) throw new Error(`Falha ao ler os marcadores da agenda: ${r.error.message}`);
  }

  const daVisita = (visitas.data ?? []) as unknown as { inicio: string; lead: { arquivado_em: string | null } | null }[];
  return contarPorDia([
    ...daVisita.filter((v) => v.lead && !v.lead.arquivado_em).map((v) => v.inicio),
    ...(tarefas.data ?? []).map((t) => t.prazo),
    ...(lembretes.data ?? []).flatMap((l) => (l.lembrete_em ? [l.lembrete_em] : [])),
  ]);
}

export async function lerItensDoDia(p: Recorte & { dia: Dia }): Promise<ItemDaAgenda[]> {
  const { inicio, fim } = limitesDoDia(p.dia);
  const supabase = createServiceClient();
  const [visitas, tarefas, lembretes] = await Promise.all([
    visitasEntre(p, inicio, fim, MAXIMO_POR_DIA),
    supabase
      .from("lead_tarefas")
      .select("id, titulo, prazo, lead_id, lead:leads(nome)")
      .eq("grupo_id", p.grupoId)
      .eq("corretor_id", p.corretorId)
      .is("concluida_em", null)
      .gte("prazo", inicio.toISOString())
      .lt("prazo", fim.toISOString())
      .order("prazo", { ascending: true })
      .limit(MAXIMO_POR_DIA),
    supabase
      .from("anotacoes")
      .select("id, texto, lembrete_em, lead_id")
      .eq("grupo_id", p.grupoId)
      .eq("destinatario_id", p.corretorId)
      .is("concluida_em", null)
      .gte("lembrete_em", inicio.toISOString())
      .lt("lembrete_em", fim.toISOString())
      .order("lembrete_em", { ascending: true })
      .limit(MAXIMO_POR_DIA),
  ]);
  if (tarefas.error) throw new Error(`Falha ao ler as tarefas da agenda: ${tarefas.error.message}`);
  if (lembretes.error) throw new Error(`Falha ao ler os lembretes da agenda: ${lembretes.error.message}`);

  const itens: ItemDaAgenda[] = [
    ...visitas,
    ...((tarefas.data ?? []) as unknown as {
      id: string;
      titulo: string;
      prazo: string;
      lead_id: string | null;
      lead: { nome: string } | null;
    }[]).map((t): ItemDaAgenda => ({
      tipo: "tarefa",
      id: t.id,
      inicio: t.prazo,
      titulo: t.titulo,
      leadId: t.lead_id,
      nome: t.lead?.nome ?? null,
    })),
    ...(lembretes.data ?? []).flatMap((l): ItemDaAgenda[] =>
      l.lembrete_em ? [{ tipo: "lembrete", id: l.id, inicio: l.lembrete_em, texto: l.texto, leadId: l.lead_id }] : [],
    ),
  ];
  return ordenarItens(itens).slice(0, MAXIMO_POR_DIA);
}

export async function lerProximasVisitas(
  p: Recorte & { agora: Date; limite: number },
): Promise<Extract<ItemDaAgenda, { tipo: "visita" }>[]> {
  // Seis meses à frente é mais do que qualquer visita que se marca.
  const ate = new Date(p.agora.getTime() + 183 * 86_400_000);
  return visitasEntre(p, p.agora, ate, p.limite);
}

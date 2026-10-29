import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { limitesDoDia, limitesDoMes, type Dia, type Mes } from "./calendario";
import { MAXIMO_POR_DIA, contarPorDia, ordenarItens, type ItemDaAgenda } from "./itens";
import { SELECT_VISITA, SELECT_VISITA_PELO_DONO, itemDaVisita, type LinhaVisita } from "./linhaDaVisita";
import { lerCompromissos } from "./compromissos";

/**
 * A Agenda do próprio corretor: visitas (0224), tarefas da ficha (0032) e
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

/**
 * As visitas do corretor no intervalo: as que ELE faz e as dos leads dele que
 * o gestor passou a outro (0225) — o dono continua vendo, com "feita por".
 */
async function visitasEntre(r: Recorte, inicio: Date, fim: Date, limite: number) {
  const supabase = createServiceClient();
  const [minhas, passadas] = await Promise.all([
    supabase
      .from("visitas")
      .select(SELECT_VISITA)
      .eq("grupo_id", r.grupoId)
      .eq("corretor_id", r.corretorId)
      .in("status", STATUS_NA_AGENDA)
      .gte("inicio", inicio.toISOString())
      .lt("inicio", fim.toISOString())
      .order("inicio", { ascending: true })
      .limit(limite),
    supabase
      .from("visitas")
      .select(SELECT_VISITA_PELO_DONO)
      .eq("grupo_id", r.grupoId)
      .eq("lead.corretor_id", r.corretorId)
      .neq("corretor_id", r.corretorId)
      .not("passada_em", "is", null)
      .in("status", STATUS_NA_AGENDA)
      .gte("inicio", inicio.toISOString())
      .lt("inicio", fim.toISOString())
      .order("inicio", { ascending: true })
      .limit(limite),
  ]);
  for (const res of [minhas, passadas]) {
    if (res.error) throw new Error(`Falha ao ler as visitas da agenda: ${res.error.message}`);
  }
  return ([...(minhas.data ?? []), ...(passadas.data ?? [])] as unknown as LinhaVisita[])
    .map(itemDaVisita)
    .filter((v) => v !== null)
    .sort((x, y) => Date.parse(x.inicio) - Date.parse(y.inicio))
    .slice(0, limite);
}

export async function lerMarcadoresDoMes(p: Recorte & { mes: Mes }): Promise<Record<Dia, number>> {
  const { inicio, fim } = limitesDoMes(p.mes);
  const supabase = createServiceClient();
  const [visitas, compromissos, tarefas, lembretes] = await Promise.all([
    visitasEntre(p, inicio, fim, TETO_DO_MES),
    lerCompromissos({ grupoId: p.grupoId, corretorId: p.corretorId, inicio, fim, limite: TETO_DO_MES }),
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
  for (const r of [tarefas, lembretes]) {
    if (r.error) throw new Error(`Falha ao ler os marcadores da agenda: ${r.error.message}`);
  }

  return contarPorDia([
    ...visitas.map((v) => v.inicio),
    ...compromissos.map((c) => c.inicio),
    ...(tarefas.data ?? []).map((t) => t.prazo),
    ...(lembretes.data ?? []).flatMap((l) => (l.lembrete_em ? [l.lembrete_em] : [])),
  ]);
}

export async function lerItensDoDia(p: Recorte & { dia: Dia }): Promise<ItemDaAgenda[]> {
  const { inicio, fim } = limitesDoDia(p.dia);
  const supabase = createServiceClient();
  const [visitas, compromissos, tarefas, lembretes] = await Promise.all([
    visitasEntre(p, inicio, fim, MAXIMO_POR_DIA),
    lerCompromissos({ grupoId: p.grupoId, corretorId: p.corretorId, inicio, fim, limite: MAXIMO_POR_DIA }),
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
    ...compromissos,
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

/** Teto do aviso de lead em Visita sem data: é cobrança, não lista. */
const MAXIMO_SEM_HORARIO = 5;

/**
 * Leads do corretor na etapa Visita SEM data marcada. A tela antiga de
 * Visitas os mostrava no topo ("Sem horário"): era a cobrança de marcar a
 * data, e a Agenda, que é por dia, os perderia.
 */
export async function lerVisitasSemHorario(
  r: Recorte,
): Promise<{ id: string; nome: string; telefone: string | null }[]> {
  const { data, error } = await createServiceClient()
    .from("leads")
    .select("id, nome, telefone")
    .eq("grupo_id", r.grupoId)
    .eq("corretor_id", r.corretorId)
    .eq("etapa", "visita_agendada")
    .is("visita_agendada_em", null)
    .is("arquivado_em", null)
    .order("etapa_alterada_em", { ascending: true })
    .limit(MAXIMO_SEM_HORARIO);
  if (error) throw new Error(`Falha ao ler as visitas sem horário: ${error.message}`);
  return data ?? [];
}

/** Para o Início: as visitas do corretor que já passaram e ainda esperam resposta. */
export async function lerVisitasParaConfirmar(
  p: { corretorId: string; grupoId: string },
  agora = new Date(),
): Promise<{ id: string; inicio: string; nome: string; status: string }[]> {
  const { data, error } = await createServiceClient()
    .from("visitas")
    .select("id, inicio, status, lead:leads!visitas_lead_id_fkey(nome, arquivado_em)")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.corretorId)
    .in("status", ["marcada", "sem_confirmacao"])
    .lte("inicio", new Date(agora.getTime() - 60 * 60_000).toISOString())
    .gte("inicio", new Date(agora.getTime() - 14 * 86_400_000).toISOString())
    .order("inicio", { ascending: false })
    .limit(5);
  if (error) throw new Error(`Falha ao ler as visitas para confirmar: ${error.message}`);
  return ((data ?? []) as unknown as { id: string; inicio: string; status: string; lead: { nome: string; arquivado_em: string | null } | null }[])
    .filter((v) => v.lead && !v.lead.arquivado_em)
    .map((v) => ({ id: v.id, inicio: v.inicio, status: v.status, nome: v.lead!.nome }));
}

/**
 * O pedido de confirmação e o "quer remarcar" das visitas mostradas (0246,
 * 29/10/2026). À parte do `SELECT_VISITA` de propósito: antes da 0246 as
 * colunas não existem, a consulta falha e a Agenda só não mostra o botão —
 * no select principal, a Agenda inteira cairia.
 */
export async function lerConfirmacoesDasVisitas(
  grupoId: string,
  visitaIds: string[],
): Promise<Map<string, { confirmacaoPedidaEm: string | null; remarcacaoPedidaEm: string | null }>> {
  if (visitaIds.length === 0) return new Map();
  const { data, error } = await createServiceClient()
    .from("visitas")
    .select("id, confirmacao_pedida_em, remarcacao_pedida_em")
    .eq("grupo_id", grupoId)
    .in("id", visitaIds.slice(0, 200));
  if (error) return new Map();
  return new Map(
    (data ?? []).map((v) => [v.id, { confirmacaoPedidaEm: v.confirmacao_pedida_em, remarcacaoPedidaEm: v.remarcacao_pedida_em }]),
  );
}

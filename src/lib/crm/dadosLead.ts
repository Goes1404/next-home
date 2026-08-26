import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EtapaFunil, Lead, OrigemAtribuicao } from "@/lib/types";
import type { Interacao, Tarefa, TipoInteracao } from "./timeline";

/**
 * Leitura da ficha de um lead: os dados do lead, suas tarefas e a linha do
 * tempo.
 *
 * Como no resto desta camada, nenhuma consulta leva `.eq("corretor_id",…)`:
 * quem recorta é a RLS (0007 para `leads`, 0032 para as tabelas novas). Um
 * id de lead alheio na URL devolve `null` aqui e 404 na página.
 */

export type LeadDetalhado = Lead & {
  orcamentoMin: number | null;
  orcamentoMax: number | null;
  /** Renda média mensal declarada — o que decide o que o banco financia. */
  rendaMensal: number | null;
  dormitoriosMin: number | null;
  regiaoInteresse: string | null;
  empreendimentoId: string | null;
  /** Preenchido = fora das listas (0055). A ficha continua abrindo por link direto. */
  arquivadoEm: string | null;
};

const SELECT_DETALHE = `
  id, nome, email, telefone, mensagem, tipo, detalhes, origem, created_at,
  etapa, etapa_alterada_em, origem_atribuicao, visita_agendada_em, portal_origem, anuncio_origem,
  orcamento_min, orcamento_max, renda_mensal, dormitorios_min, regiao_interesse, empreendimento_id,
  arquivado_em,
  corretor:corretores(id, nome),
  empreendimento:empreendimentos(nome, slug, endereco)
`;

type LinhaDetalhe = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  mensagem: string | null;
  tipo: string;
  detalhes: unknown;
  origem: string | null;
  portal_origem: string | null;
  anuncio_origem: string | null;
  created_at: string;
  etapa: EtapaFunil;
  etapa_alterada_em: string;
  origem_atribuicao: OrigemAtribuicao | null;
  visita_agendada_em: string | null;
  orcamento_min: number | string | null;
  orcamento_max: number | string | null;
  renda_mensal: number | string | null;
  dormitorios_min: number | null;
  regiao_interesse: string | null;
  arquivado_em: string | null;
  empreendimento_id: string | null;
  corretor: { id: string; nome: string } | null;
  empreendimento: { nome: string; slug: string; endereco: string | null } | null;
};

/** `numeric` do Postgres chega como string no supabase-js. */
function numero(valor: number | string | null): number | null {
  if (valor === null) return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

export async function getLeadDetalhado(id: string): Promise<LeadDetalhado | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(SELECT_DETALHE)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as LinhaDetalhe;

  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    telefone: row.telefone,
    mensagem: row.mensagem,
    tipo: row.tipo,
    detalhes: (row.detalhes as Record<string, string> | null) ?? null,
    origem: row.origem,
    portalOrigem: row.portal_origem,
    anuncioOrigem: row.anuncio_origem,
    criadoEm: row.created_at,
    etapa: row.etapa,
    etapaAlteradaEm: row.etapa_alterada_em,
    origemAtribuicao: row.origem_atribuicao,
    visitaAgendadaEm: row.visita_agendada_em,
    corretor: row.corretor,
    empreendimento: row.empreendimento,
    orcamentoMin: numero(row.orcamento_min),
    // `numeric` do Postgres chega como STRING no supabase-js.
    rendaMensal: numero(row.renda_mensal),
    orcamentoMax: numero(row.orcamento_max),
    dormitoriosMin: row.dormitorios_min,
    regiaoInteresse: row.regiao_interesse,
    arquivadoEm: row.arquivado_em,
    empreendimentoId: row.empreendimento_id,
  };
}

export async function getTarefasDoLead(leadId: string): Promise<Tarefa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_tarefas")
    .select("id, titulo, prazo, concluida_em")
    .eq("lead_id", leadId)
    .order("prazo", { ascending: true });

  return (data ?? []).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    prazo: t.prazo,
    concluidaEm: t.concluida_em,
  }));
}

/** As tarefas em aberto do corretor logado — o bloco "Para hoje" do painel. */
export async function getMinhasTarefas(): Promise<Tarefa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lead_tarefas")
    .select("id, titulo, prazo, concluida_em, lead:leads(id, nome)")
    .is("concluida_em", null)
    .order("prazo", { ascending: true })
    .limit(50);

  return ((data ?? []) as unknown as {
    id: string;
    titulo: string;
    prazo: string;
    concluida_em: string | null;
    lead: { id: string; nome: string } | null;
  }[]).map((t) => ({
    id: t.id,
    titulo: t.titulo,
    prazo: t.prazo,
    concluidaEm: t.concluida_em,
    lead: t.lead ?? undefined,
  }));
}

const AUTOR_WHATSAPP: Record<string, string> = {
  cliente: "Cliente",
  bot: "Sofia (IA)",
  corretor: "Corretor",
};

/**
 * A linha do tempo: `lead_interacoes` MESCLADA com as mensagens de WhatsApp
 * da conversa ligada ao lead.
 *
 * As mensagens não são copiadas para `lead_interacoes` de propósito — elas
 * já são um histórico completo em `whatsapp_mensagens`, e duplicar criaria
 * duas verdades para divergir. O custo é esta segunda consulta na leitura.
 */
export async function getTimelineDoLead(leadId: string): Promise<Interacao[]> {
  const supabase = await createClient();

  const [{ data: interacoes }, { data: conversas }] = await Promise.all([
    supabase
      .from("lead_interacoes")
      .select("id, tipo, conteudo, created_at, corretor:corretores(nome)")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("whatsapp_conversas").select("id").eq("lead_id", leadId),
  ]);

  const itens: Interacao[] = ((interacoes ?? []) as unknown as {
    id: string;
    tipo: TipoInteracao;
    conteudo: string;
    created_at: string;
    corretor: { nome: string } | null;
  }[]).map((i) => ({
    id: i.id,
    tipo: i.tipo,
    conteudo: i.conteudo,
    autor: i.corretor?.nome ?? null,
    em: i.created_at,
  }));

  const conversaIds = (conversas ?? []).map((c) => c.id);
  if (conversaIds.length > 0) {
    const { data: mensagens } = await supabase
      .from("whatsapp_mensagens")
      .select("id, remetente, conteudo, created_at")
      .in("conversa_id", conversaIds)
      .order("created_at", { ascending: false })
      .limit(200);

    for (const m of mensagens ?? []) {
      itens.push({
        id: `zap-${m.id}`,
        tipo: "mensagem",
        conteudo: m.conteudo,
        autor: AUTOR_WHATSAPP[m.remetente] ?? "WhatsApp",
        em: m.created_at,
      });
    }
  }

  return itens;
}

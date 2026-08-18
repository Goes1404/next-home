import "server-only";

import { mapCorretor, SELECT_CORRETOR, type LinhaCorretor } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type {
  CorretorPerfil,
  EtapaFunil,
  Lead,
  OrigemAtribuicao,
  TemplateMensagem,
} from "@/lib/types";

/**
 * Camada de acesso da área logada.
 *
 * Tudo aqui usa o cliente COM cookies (`supabase/server.ts`), nunca o
 * `supabase/public.ts`: sem sessão, `auth.uid()` é nulo e as policies do
 * painel (0006) negam tudo — a lista de leads voltaria vazia sem erro
 * nenhum, que é o pior tipo de falha.
 *
 * `server-only` no topo garante que um import acidental a partir de um
 * Client Component quebre no build, e não em produção.
 */

/** Papéis possíveis, espelhando o `check` da migration 0007. */
export type PapelCorretor = "corretor" | "gestor";

/**
 * O corretor logado. Carrega `papel` e `ativo`, que o `CorretorPerfil`
 * público não tem: a vitrine da equipe não precisa saber quem é gestor, e
 * `SELECT_CORRETOR` alimenta as duas telas públicas de `/corretores`.
 */
export type CorretorSessao = CorretorPerfil & {
  papel: PapelCorretor;
  ativo: boolean;
};

/** Corretor da sessão atual, ou `null` se não há sessão/vínculo. */
export async function getCorretorLogado(): Promise<CorretorSessao | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("corretores")
    .select(`${SELECT_CORRETOR}, papel, ativo`)
    .eq("user_id", user.id)
    .maybeSingle<LinhaCorretor & { papel: PapelCorretor; ativo: boolean }>();

  // Sem `slug` a conta existe mas ainda não foi vinculada a um cadastro
  // publicável — o painel trata esse caso à parte.
  if (!data?.slug) return null;

  return { ...mapCorretor(data), papel: data.papel, ativo: data.ativo };
}

/**
 * Se a sessão atual enxerga o funil da equipe inteira.
 *
 * Isto governa apenas a navegação — quem é dono de qual lead é decidido pelas
 * policies da 0007, no banco. Uma falha aqui esconde um menu; não vaza dado.
 */
export async function souGestor(): Promise<boolean> {
  const corretor = await getCorretorLogado();
  return corretor?.papel === "gestor";
}

/** E-mail da conta autenticada — usado para revalidar a senha atual. */
export async function getEmailLogado(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

const SELECT_LEAD = `
  id, nome, email, telefone, mensagem, tipo, detalhes, origem, created_at,
  etapa, etapa_alterada_em, origem_atribuicao, visita_agendada_em, portal_origem, anuncio_origem,
  corretor:corretores(id, nome),
  empreendimento:empreendimentos(nome, slug, endereco)
`;

const SELECT_LEAD_BASE = `
  id, nome, email, telefone, mensagem, tipo, detalhes, origem, created_at,
  etapa, etapa_alterada_em, origem_atribuicao, visita_agendada_em, anuncio_origem,
  corretor:corretores(id, nome),
  empreendimento:empreendimentos(nome, slug, endereco)
`;

type LinhaLead = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  mensagem: string | null;
  tipo: string;
  detalhes: unknown;
  origem: string | null;
  portal_origem?: string | null;
  anuncio_origem?: string | null;
  created_at: string;
  etapa: EtapaFunil;
  etapa_alterada_em: string;
  origem_atribuicao: OrigemAtribuicao | null;
  visita_agendada_em: string | null;
  corretor: { id: string; nome: string } | null;
  empreendimento: { nome: string; slug: string; endereco: string | null } | null;
};

function mapLead(row: LinhaLead): Lead {
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
  };
}

/**
 * Leads visíveis para a sessão atual, mais recentes primeiro.
 *
 * Note a ausência de um `.eq("corretor_id", ...)` aqui: o filtro vive na
 * policy de RLS (0007), no banco. É de propósito — assim nenhum erro de
 * query nesta camada consegue vazar o lead de um corretor para outro. É
 * também o que faz a mesma função servir corretor e gestor sem um `if`: a
 * policy é que decide se "os meus" significa sete leads ou setecentos.
 */
export async function getMeusLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("leads")
    .select(SELECT_LEAD)
    .order("created_at", { ascending: false });

  let rows = res.data as unknown as LinhaLead[] | null;

  if (res.error || !rows) {
    // Fallback caso colunas adicionadas recentemente (ex: portal_origem) ainda não existam no banco
    const fallback = await supabase
      .from("leads")
      .select(SELECT_LEAD_BASE)
      .order("created_at", { ascending: false });

    if (fallback.error) {
      console.error("Falha ao carregar os leads:", res.error?.message, fallback.error.message);
      return [];
    }
    rows = fallback.data as unknown as LinhaLead[] | null;
  }

  return (rows ?? []).map(mapLead);
}

/**
 * Os mesmos leads, ordenados para o quadro: dentro de cada coluna, o que se
 * moveu por último aparece em cima. É a ordem que o índice `leads_etapa_idx`
 * atende.
 */
export async function getLeadsDoFunil(): Promise<Lead[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("leads")
    .select(SELECT_LEAD)
    .order("etapa_alterada_em", { ascending: false });

  let rows = res.data as unknown as LinhaLead[] | null;

  if (res.error || !rows) {
    // Fallback caso colunas adicionadas recentemente (ex: portal_origem) ainda não existam no banco
    const fallback = await supabase
      .from("leads")
      .select(SELECT_LEAD_BASE)
      .order("etapa_alterada_em", { ascending: false });

    if (fallback.error) {
      console.error("Falha ao carregar o funil:", res.error?.message, fallback.error.message);
      return [];
    }
    rows = fallback.data as unknown as LinhaLead[] | null;
  }

  return (rows ?? []).map(mapLead);
}

/**
 * Equipe elegível para receber lead — a lista que o gestor vê ao reatribuir.
 *
 * Mesmos critérios da roleta (`distribuir_lead`, 0011): ativo, sem pausa e
 * com cadastro publicável (`slug`). Login não é mais pré-requisito — quem
 * ainda não tem conta entra na escala do mesmo jeito; só não abre o painel
 * até ganhar uma.
 */
export async function getEquipeAtiva(): Promise<
  { id: string; nome: string; emPausa: boolean }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corretores")
    .select("id, nome, em_pausa")
    .eq("ativo", true)
    .not("slug", "is", null)
    .order("nome");

  if (error) {
    console.error("Falha ao listar a equipe:", error.message);
    return [];
  }
  return (data ?? []).map((c) => ({ id: c.id, nome: c.nome, emPausa: c.em_pausa }));
}

/**
 * Templates do corretor logado, mais recentes primeiro. RLS (0013) já
 * garante que só os próprios aparecem — sem `.eq` explícito de propósito,
 * como as outras consultas desta camada.
 */
export async function getMeusTemplates(): Promise<TemplateMensagem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("templates_mensagens")
    .select("id, titulo, conteudo, padrao")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Falha ao carregar os templates:", error.message);
    return [];
  }
  return (data ?? []) as TemplateMensagem[];
}

/**
 * Contagem de cliques de WhatsApp para o corretor logado.
 */
export async function getCliquesWhatsappCorretor(): Promise<{ hoje: number; total: number }> {
  try {
    const supabase = await createClient();
    const hojeInicio = new Date();
    hojeInicio.setHours(0, 0, 0, 0);

    const [totalRes, hojeRes] = await Promise.all([
      supabase.from("cliques_whatsapp").select("id", { count: "exact", head: true }),
      supabase
        .from("cliques_whatsapp")
        .select("id", { count: "exact", head: true })
        .gte("created_at", hojeInicio.toISOString()),
    ]);

    if (totalRes.error || hojeRes.error) {
      return { hoje: 0, total: 0 };
    }

    return {
      total: totalRes.count ?? 0,
      hoje: hojeRes.count ?? 0,
    };
  } catch {
    return { hoje: 0, total: 0 };
  }
}

/**
 * Slugs dos destaques do corretor logado, na ordem escolhida — quem entra
 * pelo link dele vê esses primeiro (ver `ordenar()` em `queries.ts`).
 */
export async function getMeusDestaques(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corretor_destaques")
    .select("empreendimento_slug")
    .order("posicao");

  if (error) throw new Error(`Falha ao carregar os destaques: ${error.message}`);
  return (data ?? []).map((d) => d.empreendimento_slug);
}


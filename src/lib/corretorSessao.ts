import "server-only";

import { mapCorretor, SELECT_CORRETOR, type LinhaCorretor } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import {
  ETAPAS_FUNIL,
  type CorretorPerfil,
  type EtapaFunil,
  type Lead,
  type OrigemAtribuicao,
  type TemplateMensagem,
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
 *
 * ATENÇÃO: sem paginação — puxa a carteira inteira. Serve apenas os lugares
 * que precisam de TODOS os leads de uma vez e sabem que o volume é pequeno.
 * Tela de lista usa `getPaginaDeLeads`; contagem usa `getContagemPorEtapa`.
 */
export async function getMeusLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(SELECT_LEAD)
    .is("arquivado_em", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`);

  return (data as unknown as LinhaLead[]).map(mapLead);
}

/** Quantos leads cada tela recebe por vez. */
export const LEADS_POR_PAGINA = 30;

/**
 * O quadro do funil renderiza um cartão por lead, sem paginação possível num
 * kanban — então ele tem um teto. Para um corretor (≈100 leads) o teto nunca
 * aparece; para o gestor, o quadro mostra os mais recentes e a coluna aponta
 * para a lista quando há mais.
 */
export const TETO_DO_QUADRO = 300;

export type FiltroLeads = {
  /** Busca por nome ou telefone, resolvida no banco via ilike. */
  busca?: string;
  /** Recorte por etapas do funil (uma ou várias — os segmentos da lista). */
  etapas?: EtapaFunil[];
  /**
   * "hoje" = o que pede ação agora: leads novos sem atendimento + visitas
   * marcadas para o dia. É o segmento que abre o dia do corretor.
   */
  recorte?: "hoje";
  /**
   * Mostra os ARQUIVADOS em vez dos ativos (0055). É o único caminho de
   * volta para um lead arquivado — sem ele, arquivar seria perder, e a
   * régua da casa é que dado guardado sem tela é dado perdido.
   */
  arquivados?: boolean;
  /** Só faz sentido para o gestor; corretor comum já é recortado pela RLS. */
  corretorId?: string;
  /** Datas `yyyy-mm-dd` vindas dos inputs de data da lista. */
  criadoDe?: string;
  criadoAte?: string;
  /**
   * Leads sem corretor responsável. Existe porque o KPI "N sem dono" da
   * administração aponta para a lista — e um número clicável que cai numa
   * lista SEM o filtro é um número que mente sobre o próprio destino.
   */
  semDono?: boolean;
  /** Sem mudança de etapa há N dias (e ainda em jogo). Mesmo motivo acima. */
  paradoDias?: number;
};

export type PaginaDeLeads = {
  leads: Lead[];
  /** Total que casa com o filtro — não só o tamanho da página. */
  total: number;
};

/**
 * Os caracteres de sintaxe do `.or()` do PostgREST (vírgula, parênteses) e os
 * curingas do ilike não podem chegar crus na query: uma vírgula digitada na
 * busca viraria um segundo predicado. Busca é nome ou telefone — nada disso
 * faz falta.
 */
function sanearBusca(busca: string): string {
  return busca.replace(/[,()%_]/g, " ").trim();
}

/**
 * O dia "de hoje" no fuso do Brasil (`yyyy-mm-dd`), não o do servidor (UTC):
 * das 21h à meia-noite os dois divergem — a mesma armadilha que quebrou o
 * calendário do bot três horas por noite.
 */
function diaEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Uma página de leads + o total do filtro, tudo resolvido no banco.
 *
 * É a fonte da tela de lista: com ~100 leads por corretor (e a equipe
 * inteira para o gestor), filtrar em memória obrigava toda visita à tela a
 * baixar a carteira completa. Aqui o navegador só recebe o que mostra.
 */
/**
 * Quantos leads estão arquivados.
 *
 * `head: true` — só o número, nenhuma linha trafegada. É o que permite o
 * botão de arquivados mostrar a contagem sem custo, e sem contagem o botão
 * não resolve o problema que ele existe para resolver: saber que há algo lá.
 *
 * A RLS recorta como no resto do arquivo: corretor conta os seus, gestor
 * conta todos.
 */
export async function contarLeadsArquivados(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("arquivado_em", "is", null);
  return count ?? 0;
}

export async function getPaginaDeLeads(
  filtro: FiltroLeads = {},
  pagina = 0,
): Promise<PaginaDeLeads> {
  const supabase = await createClient();
  const de = Math.max(0, pagina) * LEADS_POR_PAGINA;

  let query = supabase.from("leads").select(SELECT_LEAD, { count: "exact" });
  query = filtro.arquivados
    ? query.not("arquivado_em", "is", null)
    : query.is("arquivado_em", null);

  const busca = filtro.busca ? sanearBusca(filtro.busca) : "";
  if (busca) query = query.or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%`);
  if (filtro.recorte === "hoje") {
    // Novo sem atendimento OU visita marcada para hoje. Cada `.or()` vira um
    // grupo próprio no PostgREST e os grupos se combinam por AND — por isso
    // este não atropela o da busca acima.
    const dia = diaEmSaoPaulo();
    query = query.or(
      `etapa.eq.novo,and(etapa.eq.visita_agendada,visita_agendada_em.gte.${dia}T00:00:00-03:00,visita_agendada_em.lte.${dia}T23:59:59-03:00)`,
    );
  }
  if (filtro.etapas && filtro.etapas.length > 0) query = query.in("etapa", filtro.etapas);
  if (filtro.corretorId) query = query.eq("corretor_id", filtro.corretorId);
  if (filtro.criadoDe) query = query.gte("created_at", filtro.criadoDe);
  if (filtro.criadoAte) query = query.lte("created_at", `${filtro.criadoAte}T23:59:59`);
  if (filtro.semDono) query = query.is("corretor_id", null);
  if (filtro.paradoDias && filtro.paradoDias > 0) {
    // "Parado" = a etapa não muda há N dias E o negócio ainda está em jogo.
    // Fechado/perdido parados são só história encerrada.
    const limite = new Date(Date.now() - filtro.paradoDias * 86_400_000).toISOString();
    query = query
      .lt("etapa_alterada_em", limite)
      .not("etapa", "in", "(fechado,perdido)");
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(de, de + LEADS_POR_PAGINA - 1);

  if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`);

  return {
    leads: (data as unknown as LinhaLead[]).map(mapLead),
    total: count ?? 0,
  };
}

/**
 * Contagem por etapa sem baixar linha nenhuma (`head: true`): alimenta o
 * termômetro do Início e os cabeçalhos das colunas do quadro. Sete queries
 * de contagem em paralelo custam menos que uma que trafega a carteira.
 */
export async function getContagemPorEtapa(): Promise<Record<EtapaFunil, number>> {
  const supabase = await createClient();
  const pares = await Promise.all(
    ETAPAS_FUNIL.map(async (etapa) => {
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .is("arquivado_em", null)
        .eq("etapa", etapa);
      if (error) throw new Error(`Falha ao contar o funil: ${error.message}`);
      return [etapa, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(pares) as Record<EtapaFunil, number>;
}

/**
 * Os mesmos leads, ordenados para o quadro: dentro de cada coluna, o que se
 * moveu por último aparece em cima. É a ordem que o índice `leads_etapa_idx`
 * atende. Limitado a `TETO_DO_QUADRO` — ver o comentário da constante.
 */
export async function getLeadsDoFunil(busca?: string): Promise<Lead[]> {
  const supabase = await createClient();

  let query = supabase.from("leads").select(SELECT_LEAD).is("arquivado_em", null);

  // A busca é a MESMA das outras abas — mesmo saneamento, mesmas colunas.
  // Duas buscas com regras diferentes na mesma tela seria pior que nenhuma.
  const termo = busca ? sanearBusca(busca) : "";
  if (termo) query = query.or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`);

  const { data, error } = await query
    .order("etapa_alterada_em", { ascending: false })
    .limit(TETO_DO_QUADRO);

  if (error) throw new Error(`Falha ao carregar o funil: ${error.message}`);

  return (data as unknown as LinhaLead[]).map(mapLead);
}

/**
 * Leads com visita marcada (ou na etapa sem data ainda), para a agenda.
 * Sem data primeiro — são os que precisam de ação —, depois por horário.
 */
export async function getLeadsDeVisita(busca?: string): Promise<Lead[]> {
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(SELECT_LEAD)
    .is("arquivado_em", null)
    .eq("etapa", "visita_agendada");

  const termo = busca ? sanearBusca(busca) : "";
  if (termo) query = query.or(`nome.ilike.%${termo}%,telefone.ilike.%${termo}%`);

  const { data, error } = await query
    .order("visita_agendada_em", { ascending: true, nullsFirst: true })
    .limit(100);

  if (error) throw new Error(`Falha ao carregar as visitas: ${error.message}`);

  return (data as unknown as LinhaLead[]).map(mapLead);
}

/**
 * Quantas visitas estão marcadas para hoje — o número do cartão de pendência
 * do Início. Contado no banco pelo dia local de São Paulo.
 */
export async function getVisitasDeHoje(): Promise<number> {
  const supabase = await createClient();
  const dia = diaEmSaoPaulo();

  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("arquivado_em", null)
    .eq("etapa", "visita_agendada")
    .gte("visita_agendada_em", `${dia}T00:00:00-03:00`)
    .lte("visita_agendada_em", `${dia}T23:59:59-03:00`);

  if (error) throw new Error(`Falha ao contar as visitas: ${error.message}`);
  return count ?? 0;
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

  if (error) throw new Error(`Falha ao listar a equipe: ${error.message}`);
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

  if (error) throw new Error(`Falha ao carregar os templates: ${error.message}`);
  return (data ?? []) as TemplateMensagem[];
}

/**
 * Contagem de cliques de WhatsApp para o corretor logado.
 *
 * Devolve `null` quando a consulta falha — e não zero. São coisas
 * diferentes: "ninguém clicou hoje" é informação, "não consegui contar" é
 * ausência dela, e exibir zero nos dois casos faria o corretor concluir
 * que o link parou de converter.
 *
 * Diferente das outras consultas desta camada, esta não lança: é um bloco
 * de estatística do painel, e derrubar a página inteira por causa de um
 * contador seria troca ruim.
 */
export async function getCliquesWhatsappCorretor(): Promise<{ hoje: number; total: number } | null> {
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
      console.error(
        "Falha ao contar cliques de WhatsApp:",
        totalRes.error?.message ?? hojeRes.error?.message,
      );
      return null;
    }

    return {
      total: totalRes.count ?? 0,
      hoje: hojeRes.count ?? 0,
    };
  } catch (err) {
    console.error("Falha ao contar cliques de WhatsApp:", err);
    return null;
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



/** Uma linha da tela de contas — o que o gestor precisa para decidir. */
export type CorretorAdmin = {
  id: string;
  nome: string;
  slug: string | null;
  email: string | null;
  papel: PapelCorretor;
  ativo: boolean;
  emPausa: boolean;
  temLogin: boolean;
  leads: number;
};

/**
 * Todos os corretores para a administração — inclusive os inativos e os sem
 * slug.
 *
 * Diferente de `getEquipeAtiva()`, que continua servindo à roleta e por isso
 * só lista quem pode receber lead. Aqui o critério é o oposto: quem está fora
 * é justamente quem o gestor precisa enxergar para consertar (sem login, sem
 * slug, desativado).
 *
 * A RLS não recorta `corretores` na leitura (a policy da 0001 é pública), mas
 * `papel`, `email` e `user_id` não estão no `SELECT_CORRETOR` da vitrine —
 * esta função é o único lugar que os expõe, e só é chamada atrás da guarda de
 * gestor.
 */
export async function getCorretoresParaAdmin(): Promise<CorretorAdmin[]> {
  const supabase = await createClient();

  const [{ data: corretores }, { data: leads }] = await Promise.all([
    supabase
      .from("corretores")
      .select("id, nome, slug, email, papel, ativo, em_pausa, user_id")
      .order("papel", { ascending: false })
      .order("nome"),
    // Arquivado não conta na carga do corretor: a coluna "leads" da tela
    // de contas tem de bater com a lista que ele abre.
    supabase.from("leads").select("corretor_id").is("arquivado_em", null),
  ]);

  const porCorretor = new Map<string, number>();
  for (const lead of leads ?? []) {
    if (lead.corretor_id) porCorretor.set(lead.corretor_id, (porCorretor.get(lead.corretor_id) ?? 0) + 1);
  }

  return (corretores ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    slug: c.slug,
    email: c.email,
    papel: c.papel as PapelCorretor,
    ativo: c.ativo,
    emPausa: c.em_pausa,
    temLogin: c.user_id !== null,
    leads: porCorretor.get(c.id) ?? 0,
  }));
}

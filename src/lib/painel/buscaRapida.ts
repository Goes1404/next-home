/**
 * Busca rápida do painel (29/10/2026): a paleta de comandos que acha, de
 * qualquer tela, um lead, uma conversa, um item do catálogo ou uma tela.
 *
 * Módulo PURO (sem `server-only`, sem Supabase importado): a rota
 * `/api/painel/busca` passa o cliente da SESSÃO, e é a RLS quem garante o
 * grupo. O que este módulo decide é a VISÃO, com a mesma régua das telas de
 * trabalho (`carteiraDaVisao.ts`):
 *
 * - corretor: só os leads dele (`corretor_id` = o dele);
 * - gestor: os leads do grupo, sem as contas ocultas (0189), que é o que a
 *   RLS já abre para ele. A busca é a porta de "onde está aquele cliente?",
 *   e o gestor redistribui leads da equipe;
 * - conversas: SEMPRE a caixa pessoal (`corretor_id` = o dele), também para o
 *   gestor — igual à tela de Conversas (a da equipe mora em
 *   /corretor/admin/whatsapp);
 * - catálogo: o do grupo, como a tela de Imóveis.
 *
 * Testes: `buscaRapida.test.ts`.
 */
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { RAMO_PADRAO, lerRamo, rotulosDeEtapaDoRamo, temModulo, vocabularioDoRamo, type Ramo } from "@/lib/ramos/ramos";

export type TipoDoResultado = "pagina" | "acao" | "lead" | "conversa" | "imovel";

export type ResultadoDaBusca = {
  tipo: TipoDoResultado;
  id: string;
  titulo: string;
  detalhe?: string | null;
  href: string;
};

export type RespostaDaBusca = {
  leads: ResultadoDaBusca[];
  conversas: ResultadoDaBusca[];
  imoveis: ResultadoDaBusca[];
};

export const RESPOSTA_VAZIA: RespostaDaBusca = { leads: [], conversas: [], imoveis: [] };

/** Menos que isto não vai ao banco: "a" casaria com metade da carteira. */
export const MINIMO_PARA_BUSCAR = 2;
/** Teto por tipo: a paleta é para achar UM, não para listar. */
export const LIMITE_POR_TIPO = 5;
/** Quantos dígitos fazem o termo valer como telefone. */
const DIGITOS_DE_TELEFONE = 3;

/**
 * Tira do termo o que é sintaxe de filtro do PostgREST ou curinga do
 * `ilike` (vírgula, parênteses, `%`, `_`, `*`, barra invertida). Mesma ideia
 * de `sanearBusca` (corretorSessao.ts), com teto de tamanho.
 */
export function sanearTermo(bruto: string): string {
  return bruto
    .replace(/[,()%_*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

/** Minúsculas e sem acento, para casar "visita" com "Vísita" no filtro local. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// Recorte (quem vê o quê)
// ---------------------------------------------------------------------------

export type RecorteDaBusca = { tipo: "meus"; corretorId: string } | { tipo: "grupo" };

/** Sem sessão não há recorte: a rota responde 401 antes de consultar. */
export function recorteDaBusca(logado: { id: string; papel: string } | null): RecorteDaBusca | null {
  if (!logado) return null;
  return logado.papel === "gestor" ? { tipo: "grupo" } : { tipo: "meus", corretorId: logado.id };
}

/**
 * O pedaço do construtor de consultas do supabase-js que a busca usa. Tipado
 * à mão para o teste trocar o cliente por um gravador de chamadas.
 */
export interface Consulta<T = unknown> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
  eq(coluna: string, valor: string): Consulta<T>;
  ilike(coluna: string, padrao: string): Consulta<T>;
  is(coluna: string, valor: null): Consulta<T>;
  not(coluna: string, operador: string, valor: null): Consulta<T>;
  or(filtro: string): Consulta<T>;
  order(coluna: string, opcoes: { ascending: boolean }): Consulta<T>;
  limit(n: number): Consulta<T>;
}

export interface ClienteDaBusca {
  from(tabela: string): { select(colunas: string): Consulta };
}

type LinhaLead = { id: string; nome: string | null; telefone: string | null; etapa: string | null };
type LinhaConversa = { id: string; nome_cliente: string | null; telefone_cliente: string | null };
type LinhaImovel = { id: string; nome: string | null; slug: string | null; bairro: string | null; cidade: string | null };

/** Uma consulta por coluna (nome; telefone se houver dígitos), juntadas por id depois. */
function porColunas(termo: string, colNome: string, colTelefone: string | null): [string, string][] {
  const pares: [string, string][] = [[colNome, `%${termo}%`]];
  const digitos = soDigitos(termo);
  if (colTelefone && digitos.length >= DIGITOS_DE_TELEFONE) pares.push([colTelefone, `%${digitos}%`]);
  return pares;
}

/**
 * As consultas de leads, já com o recorte. Exportada para o teste conferir
 * que o corretor nunca consulta sem `corretor_id`.
 */
export function consultasDeLeads(
  cliente: ClienteDaBusca,
  termo: string,
  recorte: RecorteDaBusca,
  foraDasOcultas: string | null,
): Consulta[] {
  return porColunas(termo, "nome", "telefone").map(([coluna, padrao]) => {
    let q = cliente.from("leads").select("id, nome, telefone, etapa").is("arquivado_em", null).ilike(coluna, padrao);
    if (recorte.tipo === "meus") q = q.eq("corretor_id", recorte.corretorId);
    else if (foraDasOcultas) q = q.or(foraDasOcultas);
    return q.order("created_at", { ascending: false }).limit(LIMITE_POR_TIPO);
  });
}

/** Conversas: a caixa pessoal de quem está logado, para qualquer papel. */
export function consultasDeConversas(cliente: ClienteDaBusca, termo: string, corretorId: string): Consulta[] {
  return porColunas(termo, "nome_cliente", "telefone_cliente").map(([coluna, padrao]) =>
    cliente
      .from("whatsapp_conversas")
      .select("id, nome_cliente, telefone_cliente")
      .eq("corretor_id", corretorId)
      .not("lead_id", "is", null)
      .ilike(coluna, padrao)
      .order("ultima_interacao_em", { ascending: false })
      .limit(LIMITE_POR_TIPO),
  );
}

export function consultaDeImoveis(cliente: ClienteDaBusca, termo: string): Consulta {
  return cliente
    .from("empreendimentos")
    .select("id, nome, slug, bairro, cidade")
    .ilike("nome", `%${termo}%`)
    .order("ordem", { ascending: true })
    .limit(LIMITE_POR_TIPO);
}

/** Junta as listas pela ordem de chegada, sem repetir id, até o teto. */
export function mesclarPorId<T extends { id: string }>(listas: (T[] | null | undefined)[], limite = LIMITE_POR_TIPO): T[] {
  const vistos = new Set<string>();
  const saida: T[] = [];
  for (const lista of listas) {
    for (const item of lista ?? []) {
      if (vistos.has(item.id)) continue;
      vistos.add(item.id);
      saida.push(item);
      if (saida.length >= limite) return saida;
    }
  }
  return saida;
}

async function rodar<T>(consultas: Consulta[]): Promise<T[]> {
  const respostas = await Promise.all(consultas);
  // Uma coluna que falha não derruba a outra: a busca é acessória.
  return mesclarPorId(respostas.map((r) => (r.error ? [] : ((r.data ?? []) as unknown as (T & { id: string })[]))));
}

/**
 * Roda as consultas e devolve o que a paleta mostra. Cada tipo é
 * independente: falhar um (erro de banco) devolve lista vazia só nele.
 */
export async function buscarNoPainel(
  cliente: ClienteDaBusca,
  p: { termo: string; recorte: RecorteDaBusca; corretorId: string; foraDasOcultas: string | null; ramo?: Ramo | null },
): Promise<RespostaDaBusca> {
  const termo = sanearTermo(p.termo);
  if (termo.length < MINIMO_PARA_BUSCAR) return RESPOSTA_VAZIA;
  // O ramo (30/10/2026, revisão): sem catálogo de imóveis, nem consulta a
  // tabela; e a etapa do lead sai no vocabulário dele ("Reunião marcada").
  const comCatalogo = temModulo(p.ramo, "catalogoDeImoveis");
  const rotulosDoRamo: Partial<Record<EtapaFunil, string>> = rotulosDeEtapaDoRamo(p.ramo);

  const [leads, conversas, imoveis] = await Promise.all([
    rodar<LinhaLead>(consultasDeLeads(cliente, termo, p.recorte, p.foraDasOcultas)).catch(() => []),
    rodar<LinhaConversa>(consultasDeConversas(cliente, termo, p.corretorId)).catch(() => []),
    comCatalogo ? rodar<LinhaImovel>([consultaDeImoveis(cliente, termo)]).catch(() => []) : Promise.resolve([] as LinhaImovel[]),
  ]);

  return {
    leads: leads.map((l) => ({
      tipo: "lead" as const,
      id: l.id,
      titulo: l.nome?.trim() || "Sem nome",
      detalhe: [l.telefone, l.etapa ? (rotulosDoRamo[l.etapa as EtapaFunil] ?? ETAPA_LABEL[l.etapa as EtapaFunil] ?? null) : null].filter(Boolean).join(" · ") || null,
      href: `/corretor/leads/${l.id}`,
    })),
    conversas: conversas.map((c) => ({
      tipo: "conversa" as const,
      id: c.id,
      titulo: c.nome_cliente?.trim() || c.telefone_cliente || "Conversa",
      detalhe: c.nome_cliente ? c.telefone_cliente : null,
      href: `/corretor/conversas?c=${c.id}`,
    })),
    imoveis: imoveis
      .filter((i) => i.slug)
      .map((i) => ({
        tipo: "imovel" as const,
        id: i.id,
        titulo: i.nome?.trim() || "Sem nome",
        detalhe: [i.bairro, i.cidade].filter(Boolean).join(", ") || null,
        href: `/corretor/imoveis/${i.slug}`,
      })),
  };
}

// ---------------------------------------------------------------------------
// Telas e ações (filtradas no navegador, sem ida ao servidor)
// ---------------------------------------------------------------------------

export type Atalho = { href: string; titulo: string; detalhe?: string; palavras?: string[]; tipo: "pagina" | "acao" };

/**
 * As ações rápidas. Texto neutro: o produto atende vários tipos de negócio,
 * então "catálogo" e "cliente" em vez do vocabulário de uma imobiliária só.
 */
export const ACOES_RAPIDAS: Atalho[] = [
  { tipo: "acao", href: "/corretor/agenda", titulo: "Nova visita", detalhe: "Marcar na agenda", palavras: ["agendar", "visita", "compromisso", "reunião"] },
  { tipo: "acao", href: "/corretor/importar", titulo: "Importar leads", detalhe: "Planilha, lista ou e-mail", palavras: ["importar", "planilha", "contatos", "csv"] },
  { tipo: "acao", href: "/corretor/imoveis/novo", titulo: "Cadastrar no catálogo", detalhe: "Novo item", palavras: ["novo", "imóvel", "produto", "cadastrar"] },
  { tipo: "acao", href: "/corretor/campanhas", titulo: "Nova lista de transmissão", detalhe: "Mensagem para vários contatos", palavras: ["lista", "campanha", "transmissão", "disparo"] },
  { tipo: "acao", href: "/corretor/imoveis/criar-imagem", titulo: "Criar arte", detalhe: "Imagem com IA", palavras: ["arte", "imagem", "post"] },
];

/**
 * As ações rápidas do ramo (30/10/2026, revisão). Na imobiliária é
 * `ACOES_RAPIDAS`, o mesmo array de sempre. Nos outros ramos "Nova visita"
 * vira o compromisso do ramo ("Nova reunião", "Novo atendimento") e
 * "Cadastrar no catálogo" some com o catálogo de imóveis (`catalogoDeImoveis`).
 */
export function acoesRapidasDoRamo(ramo: Ramo | null | undefined): Atalho[] {
  if (lerRamo(ramo) === RAMO_PADRAO) return ACOES_RAPIDAS;
  const compromisso = vocabularioDoRamo(ramo).compromisso;
  return ACOES_RAPIDAS.flatMap((a): Atalho[] => {
    if (a.href === "/corretor/imoveis/novo") return temModulo(ramo, "catalogoDeImoveis") ? [a] : [];
    if (a.href === "/corretor/agenda") {
      return [{ ...a, titulo: `${compromisso.genero === "f" ? "Nova" : "Novo"} ${compromisso.singular}`, palavras: [...(a.palavras ?? []), compromisso.singular] }];
    }
    return [a];
  });
}

/** As telas e ações que casam com o termo. Termo vazio = as ações, para começar. */
export function filtrarAtalhos(atalhos: Atalho[], termo: string, limite = 6): Atalho[] {
  const t = normalizar(termo);
  if (!t) return atalhos.filter((a) => a.tipo === "acao").slice(0, limite);
  const pontuar = (a: Atalho): number => {
    const titulo = normalizar(a.titulo);
    if (titulo.startsWith(t)) return 3;
    if (titulo.includes(t)) return 2;
    if ((a.palavras ?? []).some((p) => normalizar(p).startsWith(t))) return 1;
    if (a.detalhe && normalizar(a.detalhe).includes(t)) return 1;
    return 0;
  };
  return atalhos
    .map((a, i) => ({ a, i, p: pontuar(a) }))
    .filter((x) => x.p > 0)
    .sort((x, y) => y.p - x.p || x.i - y.i)
    .slice(0, limite)
    .map((x) => x.a);
}

// ---------------------------------------------------------------------------
// Buscas recentes (localStorage, só conveniência deste aparelho)
// ---------------------------------------------------------------------------

export const CHAVE_DAS_RECENTES = "astro:buscas-recentes";

/**
 * A chave das buscas recentes DESTE usuário (30/10/2026, revisão): com uma
 * chave só, quem entrava depois num celular compartilhado via o que o
 * anterior procurou (nomes de clientes). O "Sair" e a tela de login apagam
 * todas (`LimparSaida`, `chavesDasRecentes`).
 */
export function chaveDasRecentes(usuarioId: string): string {
  return `${CHAVE_DAS_RECENTES}:${usuarioId}`;
}

/** As chaves de buscas recentes guardadas (a antiga, global, e as por usuário). */
export function ehChaveDasRecentes(chave: string | null | undefined): boolean {
  return chave === CHAVE_DAS_RECENTES || Boolean(chave?.startsWith(`${CHAVE_DAS_RECENTES}:`));
}
export const MAXIMO_DE_RECENTES = 6;

/** Lê o que estiver guardado; qualquer coisa estranha vira lista vazia. */
export function lerRecentes(bruto: string | null | undefined): string[] {
  if (!bruto) return [];
  try {
    const v: unknown = JSON.parse(bruto);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, MAXIMO_DE_RECENTES) : [];
  } catch {
    return [];
  }
}

/** Põe o termo no topo, sem repetir (ignora caixa e acento), até o teto. */
export function lembrarBusca(recentes: string[], termo: string): string[] {
  const limpo = termo.trim().slice(0, 60);
  if (limpo.length < MINIMO_PARA_BUSCAR) return recentes;
  const chave = normalizar(limpo);
  return [limpo, ...recentes.filter((r) => normalizar(r) !== chave)].slice(0, MAXIMO_DE_RECENTES);
}

/** Setas: anda e dá a volta nas pontas. Sem itens, -1. */
export function proximoIndice(atual: number, total: number, passo: 1 | -1): number {
  if (total <= 0) return -1;
  if (atual < 0) return passo === 1 ? 0 : total - 1;
  return (atual + passo + total) % total;
}

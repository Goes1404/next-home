import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { createClient } from "@/lib/supabase/public";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import type {
  CorretorPerfil,
  Empreendimento,
  FiltrosEmpreendimento,
  Ordenacao,
} from "@/lib/types";

/**
 * Camada de acesso a dados dos empreendimentos, sobre o Supabase real
 * (prhhrqyubjcafvucirri). RLS já restringe a leitura a `publicado = true`
 * (ver supabase/migrations/0001_init.sql) — o `.eq("publicado", true)"
 * aqui é redundante com a policy, mas deixa a intenção explícita na query.
 *
 * Colunas explícitas no embed de `corretor` (em vez de `corretores(*)`): a
 * tabela ganhou `user_id`/`slug` (login de corretor) que não devem vazar
 * pela API pública de empreendimentos.
 */

// `corretores!empreendimentos_corretor_id_fkey`, não só `corretores`: a
// 0015 deu a `empreendimentos` e `corretores` um segundo caminho de relação
// (via `corretor_destaques`, tabela ponte many-to-many), e sem o nome do
// FK o PostgREST recusa o embed por ambiguidade — a leitura de qualquer
// empreendimento passa a falhar com "more than one relationship was found".
const SELECT_EMPREENDIMENTO = `
  *,
  corretor:corretores!empreendimentos_corretor_id_fkey(id, nome, creci, whatsapp, foto_url, video_url),
  tipologias(*),
  midias(*),
  lazer:empreendimento_lazer(lazer_itens(*))
`;

/**
 * Com um corretor ativo (link pessoal, ver `corretorAtivo.ts`), ele
 * sobrepõe o corretor cadastrado em cada item — em todo lugar do site, não
 * só nos empreendimentos que são "dele" no cadastro.
 */
function aplicarCorretorAtivo(
  lista: Empreendimento[],
  corretorAtivo: Awaited<ReturnType<typeof getCorretorAtivo>>,
): Empreendimento[] {
  if (!corretorAtivo) return lista;
  return lista.map((e) => ({ ...e, corretor: corretorAtivo }));
}

async function buscarPublicados(): Promise<Empreendimento[]> {
  const supabase = createClient();
  const [{ data, error }, corretorAtivo] = await Promise.all([
    supabase.from("empreendimentos").select(SELECT_EMPREENDIMENTO).eq("publicado", true).order("ordem"),
    getCorretorAtivo(),
  ]);

  if (error) throw new Error(`Falha ao buscar empreendimentos: ${error.message}`);
  const lista = (data as unknown as LinhaEmpreendimento[]).map(mapEmpreendimento);
  return aplicarCorretorAtivo(lista, corretorAtivo);
}

function bate(e: Empreendimento, f: FiltrosEmpreendimento): boolean {
  if (f.tipo && e.tipo !== f.tipo) return false;
  if (f.cidade && e.cidade !== f.cidade) return false;
  if (f.bairro && e.bairro !== f.bairro) return false;
  if (f.precoMax != null && e.precoAPartir != null && e.precoAPartir > f.precoMax) {
    return false;
  }
  if (f.dormitoriosMin != null) {
    const maiorOuIgual = e.tipologias.some((t) => t.dormitorios >= f.dormitoriosMin!);
    if (!maiorOuIgual) return false;
  }
  return true;
}

/**
 * Empreendimentos sem preço vão para o fim em qualquer ordenação por valor:
 * "sob consulta" não é nem barato nem caro, e jogá-lo como 0 ou Infinity
 * distorceria as duas pontas da lista.
 */
/**
 * `destaquesCorretor` só existe quando a visita chegou pelo link pessoal de
 * um corretor com destaques configurados — mapeia slug → posição escolhida
 * por ele. Só entra em jogo no modo "destaque" (o padrão da listagem
 * pública); uma ordenação explícita (preço, recentes) continua vencendo,
 * já que nenhum seletor de ordenação visível ao visitante existe hoje, mas
 * se um dia existir, a escolha dele não deve ser sobreposta por uma
 * curadoria de terceiro.
 */
export function ordenar(
  lista: Empreendimento[],
  modo: Ordenacao,
  destaquesCorretor?: Map<string, number>,
): Empreendimento[] {
  const copia = [...lista];

  if (modo === "recentes") {
    return copia.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  if (modo === "preco_asc" || modo === "preco_desc") {
    const sinal = modo === "preco_asc" ? 1 : -1;
    return copia.sort((a, b) => {
      if (a.precoAPartir == null) return b.precoAPartir == null ? 0 : 1;
      if (b.precoAPartir == null) return -1;
      return (a.precoAPartir - b.precoAPartir) * sinal;
    });
  }

  if (destaquesCorretor?.size) {
    return copia.sort((a, b) => {
      const posA = destaquesCorretor.get(a.slug);
      const posB = destaquesCorretor.get(b.slug);
      if (posA != null && posB != null) return posA - posB;
      if (posA != null) return -1;
      if (posB != null) return 1;
      return Number(b.destaque) - Number(a.destaque);
    });
  }

  // "destaque": destacados primeiro, depois a ordem curada do cadastro (já
  // aplicada pelo `.order("ordem")` da query).
  return copia.sort((a, b) => Number(b.destaque) - Number(a.destaque));
}

/** Destaques do corretor ativo (link pessoal), já ordenados — ou `undefined` sem link ou sem nenhum configurado. */
async function buscarDestaquesCorretorAtivo(): Promise<Map<string, number> | undefined> {
  const corretorAtivo = await getCorretorAtivo();
  if (!corretorAtivo) return undefined;

  const supabase = createClient();
  const { data } = await supabase
    .from("corretor_destaques")
    .select("empreendimento_slug, posicao")
    .eq("corretor_id", corretorAtivo.id)
    .order("posicao");

  if (!data || data.length === 0) return undefined;
  return new Map(data.map((d) => [d.empreendimento_slug, d.posicao]));
}

/**
 * Filtra em memória sobre o conjunto já publicado, em vez de traduzir cada
 * filtro num modificador do PostgREST — no volume de um portfólio de
 * empreendimentos (dezenas a poucas centenas de itens), isso é simples e
 * rápido o bastante, e evita a sintaxe frágil de filtro sobre relação
 * aninhada (`tipologias!inner(...)`) só para o caso de dormitoriosMin.
 */
export async function getEmpreendimentos(
  filtros?: FiltrosEmpreendimento,
  ordenacao: Ordenacao = "destaque",
): Promise<Empreendimento[]> {
  const [todos, destaquesCorretor] = await Promise.all([
    buscarPublicados(),
    buscarDestaquesCorretorAtivo(),
  ]);
  const filtrados = filtros ? todos.filter((e) => bate(e, filtros)) : todos;
  return ordenar(filtrados, ordenacao, destaquesCorretor);
}

/**
 * Empreendimentos para sugerir ao pé de uma página de detalhe. Prioriza o
 * mesmo bairro, depois a mesma cidade, e completa com o que sobrar — assim
 * a régua nunca volta vazia mesmo num portfólio pequeno.
 */
export async function getSimilares(
  slug: string,
  limite = 3,
): Promise<Empreendimento[]> {
  const todos = await buscarPublicados();
  const atual = todos.find((e) => e.slug === slug);
  if (!atual) return [];

  const outros = todos.filter((e) => e.slug !== slug);
  const pontos = (e: Empreendimento) =>
    (e.bairro === atual.bairro ? 2 : 0) + (e.cidade === atual.cidade ? 1 : 0);

  return outros.sort((a, b) => pontos(b) - pontos(a)).slice(0, limite);
}

export async function getEmpreendimentosDestaque(): Promise<Empreendimento[]> {
  const todos = await buscarPublicados();
  return todos.filter((e) => e.destaque);
}

export async function getEmpreendimentoBySlug(
  slug: string,
): Promise<Empreendimento | null> {
  const supabase = createClient();
  const [{ data, error }, corretorAtivo] = await Promise.all([
    supabase.from("empreendimentos").select(SELECT_EMPREENDIMENTO).eq("slug", slug).eq("publicado", true).maybeSingle(),
    getCorretorAtivo(),
  ]);

  if (error) throw new Error(`Falha ao buscar empreendimento "${slug}": ${error.message}`);
  if (!data) return null;

  const e = mapEmpreendimento(data as unknown as LinhaEmpreendimento);
  return corretorAtivo ? { ...e, corretor: corretorAtivo } : e;
}

export async function getSlugsEmpreendimentos(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("empreendimentos")
    .select("slug")
    .eq("publicado", true);

  if (error) throw new Error(`Falha ao listar slugs: ${error.message}`);
  return data.map((row) => row.slug);
}

/* ---------------------------------------------------------------------------
 * Corretores
 *
 * Nenhuma das funções abaixo aplica `aplicarCorretorAtivo`: aqui o corretor é
 * o assunto da página, não o intermediário da visita. Sobrepor pelo cookie
 * faria a página de um corretor exibir outra pessoa para quem tivesse chegado
 * pelo link de um colega.
 * ------------------------------------------------------------------------ */

export const SELECT_CORRETOR =
  "id, slug, nome, creci, whatsapp, foto_url, video_url, fundo_tipo, fundo_foto_url, bio";

export type LinhaCorretor = {
  id: string;
  slug: string | null;
  nome: string;
  creci: string;
  whatsapp: string;
  foto_url: string | null;
  bio: string | null;
  video_url: string | null;
  fundo_tipo: string;
  fundo_foto_url: string | null;
};

export function mapCorretor(row: LinhaCorretor): CorretorPerfil {
  return {
    id: row.id,
    slug: row.slug!,
    nome: row.nome,
    creci: row.creci,
    whatsapp: row.whatsapp,
    fotoUrl: row.foto_url,
    videoUrl: row.video_url,
    fundoTipo: row.fundo_tipo as CorretorPerfil["fundoTipo"],
    fundoFotoUrl: row.fundo_foto_url,
    bio: row.bio,
  };
}

/**
 * Equipe exibida publicamente. `slug not null` filtra o registro genérico
 * "Equipe Next Home" (usado como fallback de empreendimento sem responsável),
 * que não é uma pessoa e não deve aparecer na vitrine da equipe.
 */
export async function getCorretores(): Promise<CorretorPerfil[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("corretores")
    .select(SELECT_CORRETOR)
    .not("slug", "is", null)
    .order("nome");

  if (error) throw new Error(`Falha ao listar corretores: ${error.message}`);
  return (data as LinhaCorretor[]).map(mapCorretor);
}

export async function getCorretorPorSlug(slug: string): Promise<CorretorPerfil | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("corretores")
    .select(SELECT_CORRETOR)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar corretor "${slug}": ${error.message}`);
  return data ? mapCorretor(data as LinhaCorretor) : null;
}

/** Cidades e bairros distintos, para popular os selects de filtro. */
export async function getRegioesDisponiveis(): Promise<{
  cidades: string[];
  bairros: string[];
}> {
  const todos = await buscarPublicados();
  const cidades = [...new Set(todos.map((e) => e.cidade))].sort();
  const bairros = [...new Set(todos.map((e) => e.bairro))].sort();
  return { cidades, bairros };
}

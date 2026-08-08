import { createClient } from "@/lib/supabase/public";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import type { Empreendimento, FiltrosEmpreendimento, Ordenacao } from "@/lib/types";

/**
 * Camada de acesso a dados dos empreendimentos, sobre o Supabase real
 * (prhhrqyubjcafvucirri). RLS já restringe a leitura a `publicado = true`
 * (ver supabase/migrations/0001_init.sql) — o `.eq("publicado", true)"
 * aqui é redundante com a policy, mas deixa a intenção explícita na query.
 */

const SELECT_EMPREENDIMENTO = `
  *,
  corretor:corretores(*),
  tipologias(*),
  midias(*),
  lazer:empreendimento_lazer(lazer_itens(*))
`;

async function buscarPublicados(): Promise<Empreendimento[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("empreendimentos")
    .select(SELECT_EMPREENDIMENTO)
    .eq("publicado", true)
    .order("ordem");

  if (error) throw new Error(`Falha ao buscar empreendimentos: ${error.message}`);
  return (data as unknown as LinhaEmpreendimento[]).map(mapEmpreendimento);
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
function ordenar(lista: Empreendimento[], modo: Ordenacao): Empreendimento[] {
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

  // "destaque": destacados primeiro, depois a ordem curada do cadastro (já
  // aplicada pelo `.order("ordem")` da query).
  return copia.sort((a, b) => Number(b.destaque) - Number(a.destaque));
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
  const todos = await buscarPublicados();
  const filtrados = filtros ? todos.filter((e) => bate(e, filtros)) : todos;
  return ordenar(filtrados, ordenacao);
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
  const { data, error } = await supabase
    .from("empreendimentos")
    .select(SELECT_EMPREENDIMENTO)
    .eq("slug", slug)
    .eq("publicado", true)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar empreendimento "${slug}": ${error.message}`);
  return data ? mapEmpreendimento(data as unknown as LinhaEmpreendimento) : null;
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

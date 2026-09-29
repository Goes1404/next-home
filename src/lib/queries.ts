import { cache } from "react";
import { catalogoPublicado, corretoresPublicos } from "@/lib/catalogo/cache";
import { mapCorretor, SELECT_CORRETOR, SELECT_EMPREENDIMENTO, type LinhaCorretor } from "@/lib/catalogo/selects";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { estagioDe } from "@/lib/estagioDeCompra";
import { createClient } from "@/lib/supabase/public";
import type {
  CorretorPerfil,
  Empreendimento,
  FiltrosEmpreendimento,
  Ordenacao,
  TipoImovel,
} from "@/lib/types";

// Os SELECTs e o mapeador de corretor moram em `catalogo/selects.ts` (sem
// dependência) desde a F2; continuam exportados daqui para quem já importava.
export { mapCorretor, SELECT_CORRETOR, SELECT_EMPREENDIMENTO };
export type { LinhaCorretor };

/**
 * Camada de acesso a dados dos empreendimentos, sobre o Supabase real
 * (prhhrqyubjcafvucirri). RLS já restringe a leitura a `publicado = true`
 * (ver supabase/migrations/0001_init.sql) — o `.eq("publicado", true)"
 * aqui é redundante com a policy, mas deixa a intenção explícita na query.
 */

/**
 * O catálogo publicado.
 *
 * Desde a F2 (13/09/2026) o banco não é consultado aqui: `catalogoPublicado`
 * é o cache de dados por etiqueta (ver `catalogo/cache.ts`), e `cache()` do
 * React deduplica dentro da requisição — a home chamava isto duas vezes
 * (`getEmpreendimentos` e `getRegioesDisponiveis`).
 *
 * Até 28/09 cada item carregava um "corretor dono", sobreposto pelo corretor
 * do link pessoal. O imóvel não tem mais dono: o contato do site passa pelo
 * porteiro (`/wa`), que sorteia entre quem tem WhatsApp conectado.
 */
const buscarPublicados = cache(async (): Promise<Empreendimento[]> => catalogoPublicado());

/** Minúsculas e sem acento: "Estação" e "estacao" são a mesma busca. */
function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * A busca cobre nome, nomes alternativos, bairro, cidade e construtora.
 *
 * Os alternativos entram pelo mesmo motivo que existem (0044): o visitante
 * conhece o imóvel pelo nome do ANÚNCIO — "Dom Parque" — e o cadastro se
 * chama "Lançamento ao Lado do Parque". Busca que só olha o `nome` devolve
 * vazio justamente para quem chegou mais interessado.
 *
 * Cada palavra digitada precisa aparecer em algum campo ("vista barueri"
 * acha o Vista AlphaGran de Barueri), mas uma palavra só precisa bater num
 * campo — busca de AND estrito entre campos devolveria vazio quase sempre.
 */
export function bateBusca(e: Empreendimento, busca: string): boolean {
  const alvo = chave(
    [e.nome, ...(e.nomesAlternativos ?? []), e.bairro, e.cidade, e.construtora ?? ""].join(" "),
  );
  return chave(busca)
    .split(/\s+/)
    .filter(Boolean)
    .every((palavra) => alvo.includes(palavra));
}

export function bate(e: Empreendimento, f: FiltrosEmpreendimento): boolean {
  if (f.busca && !bateBusca(e, f.busca)) return false;
  if (f.tipo && e.tipo !== f.tipo) return false;
  if (f.cidade && e.cidade !== f.cidade) return false;
  if (f.bairro && e.bairro !== f.bairro) return false;
  if (f.precoMax != null && e.precoAPartir != null && e.precoAPartir > f.precoMax) {
    return false;
  }
  if (f.estagio && estagioDe(e.status) !== f.estagio) return false;
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

  /*
   * Sem retentativa, de propósito: isto é personalização opcional e já degrada
   * sozinho (o `error` nem é lido). Uma piscada do banco aqui custa a ORDEM
   * preferida do corretor, não a página — e fazer o visitante esperar por um
   * enfeite é trocar um custo invisível por um visível.
   */
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
  // O catálogo cacheado já tem todos os publicados — e `generateMetadata` e
  // a página pedem o MESMO slug na mesma requisição: com o `cache()` de
  // `buscarPublicados`, a segunda leitura é de graça (era uma ida ao banco a
  // mais, e depois outra inteira para os similares).
  const todos = await buscarPublicados();
  return todos.find((e) => e.slug === slug) ?? null;
}

export async function getSlugsEmpreendimentos(): Promise<string[]> {
  return (await catalogoPublicado()).map((e) => e.slug);
}

/* ---------------------------------------------------------------------------
 * Corretores
 *
 * ------------------------------------------------------------------------ */

// `SELECT_CORRETOR`, `LinhaCorretor` e `mapCorretor` moram em
// `catalogo/selects.ts` (re-exportados no topo deste arquivo).

/**
 * Equipe exibida publicamente. `slug not null` filtra o registro genérico
 * "Equipe Next Home" (usado como fallback de empreendimento sem responsável),
 * que não é uma pessoa e não deve aparecer na vitrine da equipe.
 */
export async function getCorretores(): Promise<CorretorPerfil[]> {
  return corretoresPublicos();
}

export async function getCorretorPorSlug(slug: string): Promise<CorretorPerfil | null> {
  return (await corretoresPublicos()).find((c) => c.slug === slug) ?? null;
}


/**
 * Cidades, bairros e TIPOS distintos, para popular os selects de filtro.
 *
 * Os tipos saem do catálogo publicado, não do enum: oferecer "Casa" com zero
 * casas em estoque manda o visitante para uma listagem vazia na primeira
 * interação do site — medido em produção: casa e terreno tinham 0 resultados
 * enquanto o select os oferecia.
 */
export async function getRegioesDisponiveis(): Promise<{
  cidades: string[];
  bairros: string[];
  tipos: TipoImovel[];
}> {
  const todos = await buscarPublicados();
  const cidades = [...new Set(todos.map((e) => e.cidade))].sort();
  const bairros = [...new Set(todos.map((e) => e.bairro))].sort();
  const tipos = [...new Set(todos.map((e) => e.tipo))].sort();
  return { cidades, bairros, tipos };
}

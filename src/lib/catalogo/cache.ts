import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/public";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import type { CorretorPerfil, Empreendimento } from "@/lib/types";
import { mapCorretor, SELECT_CORRETOR, SELECT_EMPREENDIMENTO, type LinhaCorretor } from "./selects";
import { REVALIDA_EM_SEGUNDOS, TAG_CATALOGO, TAG_CORRETORES } from "./tags";

/**
 * O catálogo público em cache de DADOS (F2 do roadmap de performance,
 * 13/09/2026).
 *
 * Antes, cada requisição de qualquer página pública baixava o catálogo
 * inteiro do Supabase — 243 KB de JSON, 25 imóveis com 339 mídias — e a home
 * o baixava DUAS vezes (`getEmpreendimentos` e `getRegioesDisponiveis`
 * chamavam a mesma consulta sem `cache()`), num banco que fica no Canadá a
 * ~100 ms por ida-e-volta de uma função na Virgínia. Medido: TTFB de 0,3 a
 * 2,9 s na home.
 *
 * Aqui a consulta roda uma vez por hora POR DEPLOY (o Data Cache da Vercel
 * é durável e compartilhado entre instâncias) e, entre uma e outra, cada
 * requisição lê o resultado pronto. A revalidação de verdade é por
 * ETIQUETA: toda action do painel que grava imóvel, mídia, tipologia ou
 * lazer chama `revalidarCatalogo()` (ver `revalidar.ts`), e a próxima
 * requisição recalcula.
 *
 * O que NÃO entra aqui, de propósito:
 * - O corretor ATIVO (cookie do link pessoal). `unstable_cache` proíbe
 *   `cookies()` dentro do escopo, e a personalização é barata em memória —
 *   `aplicarCorretorAtivo` em `queries.ts` a faz sobre o resultado cacheado.
 * - O painel. `catalogoDoPainel.ts` lê com o cliente de SESSÃO e vê
 *   rascunho; este é o cliente público, `publicado = true`.
 *
 * `unstable_cache` e não `'use cache'`: a diretiva exige `cacheComponents`
 * ligado, que muda o contrato de TODAS as 50 rotas (cookie fora de Suspense
 * vira erro de build) — é a F2b do roadmap, com o painel verificável antes.
 * A API antiga segue suportada no Next 16 como camada separada, e é o que
 * cabe numa fase sem quebrar o resto.
 */
export const catalogoPublicado = unstable_cache(
  async (): Promise<Empreendimento[]> => {
    const supabase = createClient();
    const { data, error } = await comRetentativa("empreendimentos publicados", () =>
      supabase.from("empreendimentos").select(SELECT_EMPREENDIMENTO).eq("publicado", true).order("ordem"),
    );
    if (error) throw new Error(`Falha ao buscar empreendimentos: ${error.message}`);
    return (data as unknown as LinhaEmpreendimento[]).map(mapEmpreendimento);
  },
  ["catalogo-publicado"],
  { tags: [TAG_CATALOGO], revalidate: REVALIDA_EM_SEGUNDOS },
);

/** Corretores com página pública (slug preenchido), em ordem de nome. */
export const corretoresPublicos = unstable_cache(
  async (): Promise<CorretorPerfil[]> => {
    const supabase = createClient();
    const { data, error } = await comRetentativa("corretores", () =>
      supabase.from("corretores").select(SELECT_CORRETOR).not("slug", "is", null).order("nome"),
    );
    if (error) throw new Error(`Falha ao listar corretores: ${error.message}`);
    return (data as LinhaCorretor[]).map(mapCorretor);
  },
  ["corretores-publicos"],
  { tags: [TAG_CORRETORES], revalidate: REVALIDA_EM_SEGUNDOS },
);

export type AtuacaoCorretor = {
  total: number;
  cidades: string[];
};

/** Quantos imóveis publicados cada corretor tem, e em que cidades. */
export const atuacaoPorCorretor = unstable_cache(
  async (): Promise<Record<string, AtuacaoCorretor>> => {
    const supabase = createClient();
    const { data, error } = await comRetentativa("atuação dos corretores", () =>
      supabase.from("empreendimentos").select("corretor_id, cidade").eq("publicado", true),
    );
    if (error) throw new Error(`Falha ao apurar atuação dos corretores: ${error.message}`);

    const porCorretor: Record<string, { total: number; cidades: Set<string> }> = {};
    for (const linha of data) {
      if (!linha.corretor_id) continue;
      const atual = (porCorretor[linha.corretor_id] ??= { total: 0, cidades: new Set() });
      atual.total += 1;
      atual.cidades.add(linha.cidade);
    }
    return Object.fromEntries(
      Object.entries(porCorretor).map(([id, { total, cidades }]) => [id, { total, cidades: [...cidades].sort() }]),
    );
  },
  ["atuacao-por-corretor"],
  { tags: [TAG_CATALOGO, TAG_CORRETORES], revalidate: REVALIDA_EM_SEGUNDOS },
);

/** Imóveis publicados de UM corretor, pela chave estrangeira do cadastro. */
export const empreendimentosDoCorretor = unstable_cache(
  async (corretorId: string): Promise<Empreendimento[]> => {
    const supabase = createClient();
    const { data, error } = await comRetentativa("empreendimentos do corretor", () =>
      supabase
        .from("empreendimentos")
        .select(SELECT_EMPREENDIMENTO)
        .eq("corretor_id", corretorId)
        .eq("publicado", true)
        .order("ordem"),
    );
    if (error) throw new Error(`Falha ao buscar empreendimentos do corretor: ${error.message}`);
    return (data as unknown as LinhaEmpreendimento[]).map(mapEmpreendimento);
  },
  ["empreendimentos-do-corretor"],
  { tags: [TAG_CATALOGO], revalidate: REVALIDA_EM_SEGUNDOS },
);

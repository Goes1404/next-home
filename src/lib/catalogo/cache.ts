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
 * vira erro de build). A F2b (12/10/2026) foi feita SEM ela — `revalidate`
 * nos layouts de grupo mais tema e personalização lidos no navegador — e a
 * API antiga segue suportada no Next 16 como camada separada. É o que cabe
 * enquanto o painel não tem credencial de E2E para verificar a troca.
 */
/*
 * Por GRUPO (L15): sem o filtro, o primeiro grupo de teste da fase 2
 * apareceria no site da Next Home, no sitemap e na IA dela. O grupo é
 * argumento, e o `unstable_cache` põe os argumentos na chave: cada grupo
 * tem a sua entrada, e a etiqueta (`revalidarCatalogo`) limpa todas.
 */
export const catalogoPublicado = unstable_cache(
  async (grupoId: string): Promise<Empreendimento[]> => {
    const supabase = createClient();
    const { data, error } = await comRetentativa("empreendimentos publicados", () =>
      supabase
        .from("empreendimentos")
        .select(SELECT_EMPREENDIMENTO)
        .eq("grupo_id", grupoId)
        .eq("publicado", true)
        .order("ordem"),
    );
    if (error) throw new Error(`Falha ao buscar empreendimentos: ${error.message}`);
    return (data as unknown as LinhaEmpreendimento[]).map(mapEmpreendimento);
  },
  ["catalogo-publicado-por-grupo"],
  { tags: [TAG_CATALOGO], revalidate: REVALIDA_EM_SEGUNDOS },
);

/**
 * Corretores com página pública (ativos e com slug), em ordem de nome.
 *
 * `ativo` entrou em 07/10/2026: o perfil de demonstração tem login e slug (sem
 * slug o painel não abre) e não pode aparecer no site nem valer como link
 * pessoal. Desativado, ele também fica fora da roleta.
 */
export const corretoresPublicos = unstable_cache(
  async (grupoId: string): Promise<CorretorPerfil[]> => {
    const supabase = createClient();
    const { data, error } = await comRetentativa("corretores", () =>
      supabase
        .from("corretores")
        .select(SELECT_CORRETOR)
        // A equipe do grupo do site (L15), não a da plataforma inteira.
        .eq("grupo_id", grupoId)
        .eq("ativo", true)
        .not("slug", "is", null)
        .order("nome"),
    );
    if (error) throw new Error(`Falha ao listar corretores: ${error.message}`);
    // Conta só WhatsApp (0180) não é corretor do site. À parte e tolerante:
    // sem a migration a coluna não existe, e o site não pode cair por isso.
    const { data: soWhatsapp } = await supabase
      .from("corretores")
      .select("id")
      .eq("grupo_id", grupoId)
      .eq("so_whatsapp", true);
    const fora = new Set((soWhatsapp ?? []).map((c) => c.id));
    return (data as LinhaCorretor[]).filter((c) => !fora.has(c.id)).map(mapCorretor);
  },
  // A chave muda quando um dado de corretor é corrigido por MIGRATION: o cache
  // de dados da Vercel sobrevive ao deploy, e a etiqueta só é limpa por ação
  // do painel. "-v2" (03/10/2026): a 0151 tirou o vídeo de fundo da Bruna e o
  // site seguiu mostrando o vídeo pela entrada antiga. "-v3" (07/10/2026): o
  // filtro de `ativo`. "-v4" (19/10/2026): por grupo (o grupo também entra na
  // chave, como argumento).
  ["corretores-publicos-v4"],
  { tags: [TAG_CORRETORES], revalidate: REVALIDA_EM_SEGUNDOS },
);


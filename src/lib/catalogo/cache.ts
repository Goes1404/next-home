import "server-only";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/public";
import { semContasOcultas } from "@/lib/corretores/contaOculta";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import type { CorretorPerfil, Empreendimento } from "@/lib/types";
import { COLUNAS_PUBLICAS_DE_CORRETOR } from "@/lib/corretores/colunasPublicas";
import { mapCorretor, SELECT_EMPREENDIMENTO, type LinhaCorretor } from "./selects";
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
    // Só as colunas que a chave pública pode ler (0187): sem e-mail, sem
    // login. Um `select("*")` aqui seria recusado pelo banco inteiro.
    const { data, error } = await comRetentativa("corretores", () =>
      supabase
        .from("corretores")
        .select(COLUNAS_PUBLICAS_DE_CORRETOR)
        // A equipe do grupo do site (L15), não a da plataforma inteira.
        .eq("grupo_id", grupoId)
        .eq("ativo", true)
        .not("slug", "is", null)
        .order("nome"),
    );
    if (error) throw new Error(`Falha ao listar corretores: ${error.message}`);
    type Linha = LinhaCorretor & {
      so_whatsapp: boolean | null;
      chamada_do_link: string | null;
      oculta: boolean | null;
    };
    const linhas = data as unknown as Linha[];
    // Conta oculta (0189): a RLS já a esconde da chave pública ("corretores
    // visiveis ao publico", `not oculta`); o recorte do código é a segunda
    // trava, a mesma das telas da equipe. A marca vem na própria leitura
    // (`oculta` está entre as colunas públicas, 0196), sem consulta à parte.
    const ocultas = new Set(linhas.filter((c) => c.oculta).map((c) => c.id));
    return (
      semContasOcultas(linhas, ocultas)
        // Conta só WhatsApp (0180) não é corretor do site.
        .filter((c) => !c.so_whatsapp)
        // Texto da prévia do link (0188); nulo = o padrão.
        .map((c) => ({ ...mapCorretor(c), chamadaDoLink: c.chamada_do_link ?? null }))
    );
  },
  // A chave muda quando um dado de corretor é corrigido por MIGRATION: o cache
  // de dados da Vercel sobrevive ao deploy, e a etiqueta só é limpa por ação
  // do painel. "-v2" (03/10/2026): a 0151 tirou o vídeo de fundo da Bruna e o
  // site seguiu mostrando o vídeo pela entrada antiga. "-v3" (07/10/2026): o
  // filtro de `ativo`. "-v4" (19/10/2026): por grupo (o grupo também entra na
  // chave, como argumento) e a entrada passou a levar `chamadaDoLink` (0188).
  // "-v5" (19/10/2026): a conta oculta (0189).
  ["corretores-publicos-v5"],
  { tags: [TAG_CORRETORES], revalidate: REVALIDA_EM_SEGUNDOS },
);


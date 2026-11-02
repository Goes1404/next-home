import { createServiceClient } from "@/lib/supabase/service";
import { renderizarAmostra } from "@/lib/prospeccao/amostra/renderizar";
import { vendedorDaProspeccao, whatsappDaProspeccao } from "@/lib/prospeccao/abordagem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A amostra de site de uma loja prospectada (0253, 02/11/2026):
 * `/astro/amostra/<slug>`.
 *
 * É uma página inteira em HTML, montada por `renderizarAmostra` a partir de
 * UMA linha de `prospeccao_leads` (tabela global) achada pelo slug. Não toca
 * tabela de grupo nenhum. Sem indexação, sem cache (a ficha muda pelo painel
 * e a amostra tem de mudar junto).
 *
 * `?previa=1` é a prévia do painel: mostra a mesma página sem registrar a
 * visita, para o vendedor conferir sem inflar o "abriu".
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!SLUG.test(slug) || slug.length > 80) return naoEncontrada();

  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("prospeccao_leads")
    .select("nome, slug, modelo, cidade, bairro, endereco, amostra")
    .eq("slug", slug)
    .maybeSingle();
  if (!lead) return naoEncontrada();

  const previa = new URL(req.url).searchParams.has("previa");
  const html = renderizarAmostra(lead, {
    rastrear: !previa,
    whatsappDaAstro: whatsappDaProspeccao(),
    vendedor: vendedorDaProspeccao(),
  });
  return new Response(html, { status: 200, headers: CABECALHOS });
}

const CABECALHOS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
};

function naoEncontrada(): Response {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Astro Soluções</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#050b18;color:#e8eef8;text-align:center;padding:24px}h1{margin:0 0 8px}p{opacity:.8;margin:0}a{color:#a9c1e0}</style></head>
<body><div><h1>Prévia não encontrada</h1><p>Este link de prévia não existe mais. Conheça a <a href="/astro">Astro Soluções</a>.</p></div></body></html>`;
  return new Response(html, { status: 404, headers: CABECALHOS });
}

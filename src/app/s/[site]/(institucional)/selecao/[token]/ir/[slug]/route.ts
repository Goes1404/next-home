import { NextResponse, after } from "next/server";
import { corretoresPublicos } from "@/lib/catalogo/cache";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { linkPublicoDoImovel } from "@/lib/imovelPublico/ler";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarEventoDoLink } from "@/lib/crm/eventosDoLink";
import { linkValido } from "@/lib/crm/linksDoCliente";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{1,120}$/;

/**
 * O clique num imóvel da seleção do cliente (26/09/2026, 0121).
 *
 * Registra QUAL imóvel ele abriu e leva à ficha pública. É o que diz ao
 * corretor, na ficha do lead, por onde começar a conversa ("vi que você
 * olhou o Vitra").
 *
 * Nunca trava o cliente: token inválido, vencido ou imóvel fora da seleção
 * só deixam de registrar — o redirecionamento acontece do mesmo jeito. A
 * prévia do corretor (`?previa=1`) não conta. E o destino é sempre montado
 * aqui a partir de um slug conferido por regex: esta rota não redireciona
 * para endereço que venha de fora.
 *
 * O destino depende do grupo de quem mandou a seleção (21/10/2026): Next Home
 * e grupo com site próprio abrem a página do imóvel no site; grupo SEM site
 * abre a ficha pública do painel (`/imovel/<grupo>/<slug>?c=<corretor>`),
 * porque o endereço do painel não serve as páginas do site.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; slug: string }> },
) {
  const { token, slug } = await params;
  if (!SLUG.test(slug)) return NextResponse.redirect(new URL("/empreendimentos", request.url));
  const padrao = new URL(`/empreendimentos/${slug}`, request.url);
  const previa = new URL(request.url).searchParams.get("previa") === "1";
  if (!UUID.test(token)) return NextResponse.redirect(padrao);
  const destino = await destinoDoGrupo(token, slug, padrao);
  if (previa) return NextResponse.redirect(destino);

  after(async () => {
    const supabase = createServiceClient();
    const [{ data: link }, { data: imovel }] = await Promise.all([
      supabase
        .from("links_do_cliente")
        .select("token, lead_id, corretor_id, dados, expira_em")
        .eq("token", token)
        .eq("tipo", "selecao")
        .maybeSingle(),
      supabase.from("empreendimentos").select("id, nome").eq("slug", slug).maybeSingle(),
    ]);
    if (!link || !linkValido(link) || !imovel) return;
    const ids = (link.dados as { empreendimentos?: unknown })?.empreendimentos;
    if (!Array.isArray(ids) || !ids.includes(imovel.id)) return;
    await registrarEventoDoLink(supabase, {
      token,
      leadId: link.lead_id,
      corretorId: link.corretor_id,
      tipo: "clicou",
      detalhe: imovel.nome,
    });
  });

  return NextResponse.redirect(destino);
}

/**
 * Para onde o cliente vai: o link público do imóvel no grupo de quem mandou a
 * seleção. Grupo 1, leitura que falha ou token que não existe: o destino de
 * sempre (o site do próprio endereço). Nunca lança, nunca trava o cliente.
 */
async function destinoDoGrupo(token: string, slug: string, padrao: URL): Promise<URL> {
  try {
    const supabase = createServiceClient();
    const { data: link } = await supabase
      .from("links_do_cliente")
      .select("grupo_id, corretor_id")
      .eq("token", token)
      .eq("tipo", "selecao")
      .maybeSingle();
    if (!link || link.grupo_id === GRUPO_NEXT_HOME_ID) return padrao;
    // A equipe pública do grupo (cache do catálogo): o corretor da seleção, se ativo.
    const corretor = (await corretoresPublicos(link.grupo_id)).find((c) => c.id === link.corretor_id);
    return new URL(await linkPublicoDoImovel({ grupoId: link.grupo_id, slug, corretorSlug: corretor?.slug ?? null }));
  } catch (erro) {
    console.error("[seleção] destino do imóvel não montado, usando o do endereço:", erro);
    return padrao;
  }
}

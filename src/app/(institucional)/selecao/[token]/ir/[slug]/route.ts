import { NextResponse, after } from "next/server";
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
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; slug: string }> },
) {
  const { token, slug } = await params;
  if (!SLUG.test(slug)) return NextResponse.redirect(new URL("/empreendimentos", request.url));
  const destino = new URL(`/empreendimentos/${slug}`, request.url);
  const previa = new URL(request.url).searchParams.get("previa") === "1";
  if (!UUID.test(token) || previa) return NextResponse.redirect(destino);

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

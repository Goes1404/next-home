import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { codigoComFormato } from "@/lib/crm/vitrine";
import { caminhoDoLink } from "@/lib/crm/linksDoCliente";

export const dynamic = "force-dynamic";

/**
 * O link curto da vitrine (29/10/2026, 0245): `/v/<codigo>` leva à seleção
 * (`/selecao/<token>`), que é quem confere o token, a validade e mede a
 * abertura. Aqui só se traduz o código: nada é gravado, e código que não
 * existe cai no 404 da seleção (que não diz se existiu).
 *
 * Redirecionamento, não reescrita: a página da seleção é UMA (as guardas de
 * grupo e de taxas leem o arquivo dela), e o robô do WhatsApp segue o
 * redirecionamento para montar a prévia. `?previa=1` (o "ver como o cliente
 * vê" do corretor) segue junto.
 */
export async function GET(request: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const previa = new URL(request.url).searchParams.get("previa") === "1";
  if (!codigoComFormato(codigo)) return NextResponse.redirect(new URL("/selecao/x", request.url), 302);

  const { data: link } = await createServiceClient()
    .from("links_do_cliente")
    .select("token, tipo")
    .eq("codigo", codigo)
    .maybeSingle();
  if (!link || link.tipo !== "selecao") return NextResponse.redirect(new URL("/selecao/x", request.url), 302);

  const destino = new URL(caminhoDoLink("selecao", link.token), request.url);
  if (previa) destino.searchParams.set("previa", "1");
  return NextResponse.redirect(destino, 302);
}

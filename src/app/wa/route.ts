import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { destinoDoPorteiro } from "@/lib/whatsapp/destinoDoPorteiro";
import { ehChaveIntencao } from "@/lib/whatsapp/porteiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A porta GERAL do porteiro: `/wa`, sem imóvel.
 *
 * Home, rodapé, contato e botão flutuante não têm imóvel no contexto. Aqui a
 * mensagem é a frase geral do site, que `porteiro.ts` reconhece por código —
 * sem isso, o visitante que ainda não é lead seria ignorado pelo webhook
 * (0111).
 *
 * O resto é igual à porta do imóvel: sorteia entre quem tem número
 * conectado, registra o clique e nunca termina em tela quebrada.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const supabase = createServiceClient();

  const bruto = url.searchParams.get("i");
  const intencao = ehChaveIntencao(bruto) ? bruto : null;

  const { data: sorteio } = await supabase
    .rpc("sortear_corretor_whatsapp")
    .maybeSingle<{ corretor_id: string; telefone: string }>();

  const destino = destinoDoPorteiro({ telefone: sorteio?.telefone, nomeImovel: null, intencao, complemento: url.searchParams.get("m") });

  // Aguardado de propósito: fire-and-forget perderia o clique se a função
  // for congelada logo após o redirect.
  await supabase.from("cliques_whatsapp").insert({
    corretor_id: destino.tipo === "whatsapp" ? (sorteio?.corretor_id ?? null) : null,
    empreendimento_id: null,
    origem: "site",
    url_origem: url.pathname + url.search,
    user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
  });

  return destino.tipo === "escape"
    ? NextResponse.redirect(new URL(destino.caminho, url.origin), 302)
    : NextResponse.redirect(destino.url, 302);
}

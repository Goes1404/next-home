import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { mensagemDeAnuncio, resolverCampanha } from "@/lib/whatsapp/porteiro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O link porteiro: /wa/<campanha> — o destino fixo que o anúncio do Meta
 * aponta, e que distribui o clique entre os corretores.
 *
 * No clique: sorteia o corretor da vez (rodízio por carga, no banco — a
 * mesma régua da roleta de leads) e redireciona para o wa.me DELE com a
 * mensagem pronta da campanha. A Sofia do próprio corretor atende, o lead
 * nasce no CRM já dele. Cada corretor no próprio número — número central
 * único foi descartado (decisão de produto, 26/08/2026).
 *
 * Todo clique é LOGADO em `cliques_whatsapp` (tabela que o site já usa),
 * com `origem = 'anuncio/<campanha>'` — é o denominador da métrica
 * "cliques que não viraram conversa", que nem o Gerenciador da Meta dá.
 *
 * Nenhum caminho termina em erro para o visitante: campanha desconhecida
 * ou nenhum corretor conectado degradam para a página do imóvel (ou a
 * home), nunca para uma tela quebrada — o clique custou dinheiro.
 */
export async function GET(req: Request, ctx: { params: Promise<{ campanha: string }> }) {
  const { campanha } = await ctx.params;
  const url = new URL(req.url);
  const supabase = createServiceClient();

  const { data: imoveis } = await supabase
    .from("empreendimentos")
    .select("id, slug, nome, nomes_alternativos")
    .eq("publicado", true);

  const alvo = resolverCampanha(campanha, imoveis ?? []);

  // Fire-and-forget seria perder o clique se a função for congelada logo
  // após o redirect; o insert é aguardado de propósito (custa ~1 RTT).
  const registrarClique = async (corretorId: string | null) => {
    await supabase.from("cliques_whatsapp").insert({
      corretor_id: corretorId,
      empreendimento_id: alvo?.id ?? null,
      origem: `anuncio/${campanha.slice(0, 80)}`,
      url_origem: url.pathname + url.search,
      user_agent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
  };

  if (!alvo) {
    // Link com typo ou imóvel despublicado: registra (para o erro aparecer
    // na métrica, não sumir) e manda para a home.
    await registrarClique(null);
    return NextResponse.redirect(new URL("/", url.origin), 302);
  }

  const { data: sorteio } = await supabase.rpc("sortear_corretor_whatsapp").maybeSingle<{
    corretor_id: string;
    telefone: string;
  }>();

  const telefone = sorteio?.telefone?.replace(/\D/g, "") ?? "";

  if (!sorteio || telefone.length < 10) {
    // Nenhum corretor com WhatsApp conectado: o clique não pode morrer.
    // A página do imóvel tem formulário e o link de WhatsApp do site.
    await registrarClique(null);
    return NextResponse.redirect(new URL(`/empreendimentos/${alvo.slug}`, url.origin), 302);
  }

  await registrarClique(sorteio.corretor_id);

  const destino = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagemDeAnuncio(alvo.nome))}`;
  return NextResponse.redirect(destino, 302);
}

import { NextResponse } from "next/server";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { createServiceClient } from "@/lib/supabase/service";
import { destinoDoPorteiro } from "@/lib/whatsapp/destinoDoPorteiro";
import { numeroDoLinkPessoal } from "@/lib/whatsapp/numeroDoLinkPessoal";
import { ehChaveIntencao } from "@/lib/whatsapp/porteiro";
import { diaEmSaoPauloISO, ehCliqueDePessoa, ipDaRequisicao, segredoDaMedicao, visitanteDoClique } from "@/lib/whatsapp/medicaoDoLink";

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
 * conectado (ou vai direto ao corretor do link pessoal), registra o clique e
 * nunca termina em tela quebrada.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const supabase = createServiceClient();

  const bruto = url.searchParams.get("i");
  const intencao = ehChaveIntencao(bruto) ? bruto : null;

  // Link pessoal (cookie de 30 dias): vai SEMPRE para o corretor do link,
  // nunca para o sorteio (07/10/2026).
  const doLink = await getCorretorAtivo();
  const numeroDoLink = doLink ? await numeroDoLinkPessoal(supabase, doLink) : null;
  const sorteio = numeroDoLink
    ? { corretor_id: doLink!.id, telefone: numeroDoLink }
    : (
        await supabase
          .rpc("sortear_corretor_whatsapp")
          .maybeSingle<{ corretor_id: string; telefone: string }>()
      ).data;

  const destino = destinoDoPorteiro({ telefone: sorteio?.telefone, nomeImovel: null, intencao, complemento: url.searchParams.get("m") });

  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  // Aguardado de propósito: fire-and-forget perderia o clique se a função
  // for congelada logo após o redirect.
  await supabase.from("cliques_whatsapp").insert({
    corretor_id: destino.tipo === "whatsapp" ? (sorteio?.corretor_id ?? null) : null,
    empreendimento_id: null,
    origem: "site",
    // Só clique gravado aqui pode cadastrar quem escreve sem a mensagem pronta (0143).
    pelo_porteiro: true,
    url_origem: url.pathname + url.search,
    user_agent: userAgent,
    // A porta geral é sempre do site: vale o toque numa página nossa (0174).
    de_pessoa: ehCliqueDePessoa({
      userAgent,
      doSite: true,
      secFetchSite: req.headers.get("sec-fetch-site"),
      secFetchUser: req.headers.get("sec-fetch-user"),
      referer: req.headers.get("referer"),
      host: url.host,
    }),
    visitante: visitanteDoClique({
      ip: ipDaRequisicao(req.headers),
      userAgent,
      dia: diaEmSaoPauloISO(),
      segredo: segredoDaMedicao(),
    }),
  });

  return destino.tipo === "escape"
    ? NextResponse.redirect(new URL(destino.caminho, url.origin), 302)
    : NextResponse.redirect(destino.url, 302);
}

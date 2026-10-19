import { NextResponse } from "next/server";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { createServiceClient } from "@/lib/supabase/service";
import { destinoDoPorteiro } from "@/lib/whatsapp/destinoDoPorteiro";
import { numeroDoLinkPessoal } from "@/lib/whatsapp/numeroDoLinkPessoal";
import { ehChaveIntencao, resolverCampanha } from "@/lib/whatsapp/porteiro";
import { diaEmSaoPauloISO, ehCliqueDePessoa, ipDaRequisicao, segredoDaMedicao, visitanteDoClique } from "@/lib/whatsapp/medicaoDoLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O link porteiro: /wa/<campanha> — o destino fixo que o anúncio do Meta
 * aponta, e que distribui o clique entre os corretores.
 *
 * No clique: sorteia o corretor da vez no banco — aleatório entre os que têm
 * WhatsApp conectado, e quem recebeu o último clique DESTE imóvel vai para o
 * fim (rodízio por produto, 0117) — e redireciona para o wa.me DELE com a
 * mensagem pronta da campanha. A Sofia do próprio corretor atende, o lead
 * nasce no CRM já dele. Cada corretor no próprio número — número central
 * único foi descartado (decisão de produto, 26/08/2026).
 *
 * Todo clique é LOGADO em `cliques_whatsapp` (tabela que o site já usa),
 * com `origem = 'anuncio/<campanha>'` — é o denominador da métrica
 * "cliques que não viraram conversa", que nem o Gerenciador da Meta dá.
 *
 * Desde 28/09 é também a porta de TODO botão de imóvel do site
 * (`linkDoPorteiro`, com `?i=<intenção>&de=site`): o imóvel não tem mais
 * corretor dono, e o contato vai para quem tem número conectado.
 *
 * Nenhum caminho termina em erro para o visitante: campanha desconhecida
 * vai para a home, e nenhum corretor conectado vai para `/contato`, que tem
 * formulário — nunca para uma tela quebrada, porque o clique pode ter
 * custado dinheiro.
 */
export async function GET(req: Request, ctx: { params: Promise<{ campanha: string }> }) {
  const { campanha } = await ctx.params;
  const url = new URL(req.url);
  const supabase = createServiceClient();

  const bruto = url.searchParams.get("i");
  const intencao = ehChaveIntencao(bruto) ? bruto : null;
  const doSite = url.searchParams.get("de") === "site";

  const { data: imoveis } = await supabase
    .from("empreendimentos")
    .select("id, slug, nome, nomes_alternativos")
    .eq("publicado", true);

  // A linha crua do banco usa snake_case; sem este mapeamento o apelido
  // nunca chega ao casamento — foi exatamente o bug do primeiro teste em
  // produção (/wa/manaca caía na home).
  const alvo = resolverCampanha(
    campanha,
    (imoveis ?? []).map((i) => ({
      id: i.id,
      slug: i.slug,
      nome: i.nome,
      nomesAlternativos: i.nomes_alternativos,
    })),
  );

  // Fire-and-forget seria perder o clique se a função for congelada logo
  // após o redirect; o insert é aguardado de propósito (custa ~1 RTT).
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  // Toque de pessoa ou robô (0174): só muda a contagem, o destino é o mesmo.
  const dePessoa = ehCliqueDePessoa({
    userAgent,
    doSite,
    secFetchSite: req.headers.get("sec-fetch-site"),
    secFetchUser: req.headers.get("sec-fetch-user"),
    referer: req.headers.get("referer"),
    host: url.host,
  });
  const registrarClique = async (corretorId: string | null) => {
    await supabase.from("cliques_whatsapp").insert({
      corretor_id: corretorId,
      empreendimento_id: alvo?.id ?? null,
      origem: `${doSite ? "site" : "anuncio"}/${campanha.slice(0, 80)}`,
      // Só clique gravado aqui pode cadastrar quem escreve sem a mensagem pronta (0143).
      pelo_porteiro: true,
      url_origem: url.pathname + url.search,
      user_agent: userAgent,
      de_pessoa: dePessoa,
      // Conta pessoas, não cliques: um clique repetido é a mesma pessoa (0159).
      visitante: visitanteDoClique({
        ip: ipDaRequisicao(req.headers),
        userAgent,
        dia: diaEmSaoPauloISO(),
        segredo: segredoDaMedicao(),
      }),
    });
  };

  if (!alvo) {
    // Link com typo ou imóvel despublicado: registra (para o erro aparecer
    // na métrica, não sumir) e manda para a home.
    await registrarClique(null);
    return NextResponse.redirect(new URL("/", url.origin), 302);
  }

  type Sorteio = { corretor_id: string; telefone: string };
  // Link pessoal (cookie de 30 dias): vai SEMPRE para o corretor do link,
  // nunca para o sorteio — antes, desconectado, ele perdia o cliente para
  // outro corretor (07/10/2026). Anúncio pago sem cookie segue no rodízio.
  const doLink = await getCorretorAtivo();
  const numeroDoLink = doLink ? await numeroDoLinkPessoal(supabase, doLink) : null;
  let sorteio: Sorteio | null = numeroDoLink ? { corretor_id: doLink!.id, telefone: numeroDoLink } : null;
  const primeiro = sorteio
    ? null
    : await supabase.rpc("sortear_corretor_whatsapp", { p_empreendimento: alvo.id }).maybeSingle<Sorteio>();
  if (primeiro) sorteio = primeiro.data;
  const erroDoSorteio = primeiro?.error;
  if (erroDoSorteio) {
    // Banco sem a assinatura nova (0117/0130): sorteia
    // pela versão antiga em vez de perder o clique pago.
    ({ data: sorteio } = await supabase.rpc("sortear_corretor_whatsapp").maybeSingle<Sorteio>());
  }

  const destino = destinoDoPorteiro({ telefone: sorteio?.telefone, nomeImovel: alvo.nome, intencao, complemento: url.searchParams.get("m") });

  if (destino.tipo === "escape") {
    // Nenhum corretor com WhatsApp conectado: o clique não pode morrer.
    await registrarClique(null);
    return NextResponse.redirect(new URL(destino.caminho, url.origin), 302);
  }

  await registrarClique(sorteio?.corretor_id ?? null);
  return NextResponse.redirect(destino.url, 302);
}

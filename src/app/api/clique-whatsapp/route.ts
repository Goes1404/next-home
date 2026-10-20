import { NextResponse } from "next/server";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { siteDaRequisicao } from "@/lib/sites/pagina";
import { createServiceClient } from "@/lib/supabase/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = "nodejs";

type CorpoClique = {
  corretorId?: string | null;
  empreendimentoSlug?: string | null;
  origem: string;
  urlOrigem?: string | null;
};

export async function POST(req: Request) {
  let corpo: CorpoClique;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") ?? null;
  /*
   * Pela chave de serviço, com o grupo do site (L14). Pela chave pública o
   * clique não carrega o grupo (o `anon` só tem insert nas colunas da 0143)
   * e conceder a coluna deixaria qualquer um gravar em qualquer grupo. Aqui
   * o corpo vem do navegador: corretor e imóvel só valem se forem do grupo do
   * site; se não, o clique é gravado sem eles. As colunas são só estas:
   * `pelo_porteiro` continua fora, como na 0143.
   */
  // O grupo vem do ENDEREÇO do site (fase 3); endereço de nenhum grupo não grava nada.
  const site = await siteDaRequisicao(req);
  if (!site) return NextResponse.json({ erro: "Endereço sem site." }, { status: 404 });
  const grupo = site.grupoId;
  const supabase = createServiceClient();

  // Se veio corretorId explícito, usa ele (se for do grupo). Se não, tenta
  // pegar o corretor ativo do cookie, que já é do grupo do site.
  let corretorId: string | null = null;
  if (corpo.corretorId) {
    const { data } = UUID.test(corpo.corretorId)
      ? await supabase
          .from("corretores")
          .select("id")
          .eq("grupo_id", grupo)
          .eq("id", corpo.corretorId)
          .maybeSingle()
      : { data: null };
    corretorId = data?.id ?? null;
  } else {
    const corretorAtivo = await getCorretorAtivo(grupo);
    corretorId = corretorAtivo?.id ?? null;
  }

  let empreendimentoId: string | null = null;
  if (corpo.empreendimentoSlug) {
    const { data } = await supabase
      .from("empreendimentos")
      .select("id")
      .eq("grupo_id", grupo)
      .eq("slug", corpo.empreendimentoSlug)
      .maybeSingle();
    empreendimentoId = data?.id ?? null;
  }

  const { error } = await supabase.from("cliques_whatsapp").insert({
    grupo_id: grupo,
    corretor_id: corretorId,
    empreendimento_id: empreendimentoId,
    origem: corpo.origem || "desconhecida",
    url_origem: corpo.urlOrigem || null,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
  });

  if (error) {
    // Sem interromper a navegação, mas com rastro: o `sendBeacon` não lê a
    // resposta, e sem o log a falha seria invisível.
    console.error("[clique-whatsapp] falha ao gravar clique:", error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

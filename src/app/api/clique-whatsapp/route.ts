import { NextResponse } from "next/server";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { createClient } from "@/lib/supabase/public";

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
  const supabase = createClient();

  // Se veio corretorId explícito, usa ele. Se não, tenta pegar o corretor ativo do cookie.
  let corretorId = corpo.corretorId ?? null;
  if (!corretorId) {
    const corretorAtivo = await getCorretorAtivo();
    corretorId = corretorAtivo?.id ?? null;
  }

  let empreendimentoId: string | null = null;
  if (corpo.empreendimentoSlug) {
    const { data } = await supabase
      .from("empreendimentos")
      .select("id")
      .eq("slug", corpo.empreendimentoSlug)
      .maybeSingle();
    empreendimentoId = data?.id ?? null;
  }

  const { error } = await supabase.from("cliques_whatsapp").insert({
    corretor_id: corretorId,
    empreendimento_id: empreendimentoId,
    origem: corpo.origem || "desconhecida",
    url_origem: corpo.urlOrigem || null,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
  });

  if (error) {
    // Log silencioso sem interromper a navegação
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

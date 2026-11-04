import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { lerPedidoDeVisita } from "@/lib/prospeccao/visita";
import { avisoDeAbertura } from "@/lib/prospeccao/avisos";
import { notificarEquipeDaProspeccao } from "@/lib/notificacoes/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * O rastreio da amostra (0253, 02/11/2026). O script da página
 * `/astro/amostra/<slug>` chama duas vezes:
 *
 * - `{ slug, dispositivo }` depois de 3 s visível: registra a abertura
 *   (`registrar_visita_da_amostra`) e devolve o id da visita;
 * - `{ id, segundos }` a cada 15 s e ao sair: atualiza o tempo de leitura.
 *
 * O corpo vem como texto (o `sendBeacon` não manda JSON com cabeçalho sem
 * preflight). Não grava IP nem user-agent. Pedido inválido responde 204 sem
 * gravar: o rastreio nunca vira erro na tela de quem lê.
 */
export async function POST(req: Request) {
  const pedido = lerPedidoDeVisita(await req.text().catch(() => ""));
  if (!pedido) return new Response(null, { status: 204 });

  const supabase = createServiceClient();
  if (pedido.tipo === "tempo") {
    await supabase.rpc("atualizar_tempo_da_visita", { p_visita: pedido.id, p_segundos: pedido.segundos });
    return new Response(null, { status: 204 });
  }

  const { data: id } = await supabase.rpc("registrar_visita_da_amostra", {
    p_slug: pedido.slug,
    p_dispositivo: pedido.dispositivo,
  });
  // 04/11/2026: a loja abriu a amostra → aviso no celular de quem vende,
  // depois da resposta (a página de quem lê não espera o push).
  if (id) after(() => avisarAbertura(supabase, pedido.slug, String(id)));
  return NextResponse.json({ id: id ?? null });
}

async function avisarAbertura(supabase: ReturnType<typeof createServiceClient>, slug: string, visitaId: string) {
  try {
    const { data: loja } = await supabase.from("prospeccao_leads").select("id, nome, etapa, nao_contatar").eq("slug", slug).maybeSingle();
    if (!loja) return;
    const { data: visitas } = await supabase
      .from("prospeccao_visitas")
      .select("id, created_at")
      .eq("lead_id", loja.id)
      .order("created_at", { ascending: false })
      .limit(5);
    const anteriores = (visitas ?? []).filter((v) => v.id !== visitaId).map((v) => v.created_at);
    const aviso = avisoDeAbertura(loja, anteriores);
    if (aviso) await notificarEquipeDaProspeccao(supabase, aviso);
  } catch (err) {
    console.warn("[prospecção] aviso de abertura falhou:", err);
  }
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { lerPedidoDeVisita } from "@/lib/prospeccao/visita";

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
  return NextResponse.json({ id: id ?? null });
}

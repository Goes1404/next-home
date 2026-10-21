import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Liga e desliga a notificação no celular deste aparelho (0203).
 *
 * A inscrição é gravada pela chave de serviço (a tabela não dá grant a
 * ninguém), mas o DONO vem sempre da sessão: o corretor só inscreve
 * aparelho para si. Um endereço já inscrito por outra conta (o mesmo
 * celular usado por duas pessoas) passa para quem inscreveu por último.
 */
export const dynamic = "force-dynamic";

const NAO = (status: number, erro: string) =>
  Response.json({ ok: false, erro }, { status, headers: { "cache-control": "no-store" } });

function ehEnderecoDePush(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 1000) return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const corretor = await getCorretorLogado();
  if (!corretor) return NAO(401, "Entre no painel para ligar as notificações.");

  const corpo = (await req.json().catch(() => null)) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    aparelho?: unknown;
  } | null;
  const endpoint = corpo?.endpoint;
  const p256dh = corpo?.keys?.p256dh;
  const auth = corpo?.keys?.auth;
  if (!ehEnderecoDePush(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return NAO(400, "Não foi possível ligar as notificações neste aparelho.");
  }
  const aparelho = typeof corpo?.aparelho === "string" ? corpo.aparelho.slice(0, 120) : null;

  const supabase = createServiceClient();
  // Endereço de outra conta: sai de lá primeiro (o grupo é carimbado pela mãe
  // corretor_id, e mudar o dono por update mudaria o grupo da linha).
  await supabase.from("inscricoes_push").delete().eq("endpoint", endpoint).neq("corretor_id", corretor.id);
  const { error } = await supabase
    .from("inscricoes_push")
    .upsert(
      { corretor_id: corretor.id, grupo_id: corretor.grupoId, endpoint, p256dh, auth, aparelho },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("[notificação] falha ao inscrever:", error.message);
    return NAO(500, "Não foi possível ligar as notificações agora. Tente de novo.");
  }
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(req: Request) {
  const corretor = await getCorretorLogado();
  if (!corretor) return NAO(401, "Entre no painel.");
  const corpo = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!ehEnderecoDePush(corpo?.endpoint)) return NAO(400, "Aparelho não reconhecido.");
  const supabase = createServiceClient();
  await supabase.from("inscricoes_push").delete().eq("endpoint", corpo!.endpoint as string).eq("corretor_id", corretor.id);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

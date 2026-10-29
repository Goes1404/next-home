import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehEnderecoDePush } from "@/lib/notificacoes/enderecoDePush";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Liga e desliga o aviso no celular de QUEM ADMINISTRA A PLATAFORMA
 * (29/10/2026, 0239). O irmão `/api/notificacoes` é do corretor e parte da
 * ficha dele, que o administrador não tem.
 *
 * O dono do aparelho vem sempre da SESSÃO (`exigirAdminDaPlataformaNaAcao`,
 * que pergunta `eh_admin_da_plataforma()` ao banco): ninguém inscreve
 * aparelho para outra pessoa nem se inscreve sem ser administrador.
 */
export const dynamic = "force-dynamic";

const NAO = (status: number, erro: string) =>
  Response.json({ ok: false, erro }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return NAO(403, admin.erro);

  const corpo = (await req.json().catch(() => null)) as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
    aparelho?: unknown;
  } | null;
  const endpoint = corpo?.endpoint;
  const p256dh = corpo?.keys?.p256dh;
  const auth = corpo?.keys?.auth;
  if (!ehEnderecoDePush(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
    return NAO(400, "Não foi possível ligar os avisos neste aparelho.");
  }
  const aparelho = typeof corpo?.aparelho === "string" ? corpo.aparelho.slice(0, 120) : null;

  const { error } = await createServiceClient()
    .from("inscricoes_push_da_plataforma")
    .upsert({ user_id: admin.userId, endpoint, p256dh, auth, aparelho }, { onConflict: "endpoint" });
  if (error) {
    console.error("[notificação] falha ao inscrever aparelho da plataforma:", error.message);
    return NAO(500, "Não foi possível ligar os avisos agora. Tente de novo.");
  }
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(req: Request) {
  const admin = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in admin) return NAO(403, admin.erro);
  const corpo = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (!ehEnderecoDePush(corpo?.endpoint)) return NAO(400, "Aparelho não reconhecido.");
  await createServiceClient()
    .from("inscricoes_push_da_plataforma")
    .delete()
    .eq("endpoint", corpo!.endpoint as string)
    .eq("user_id", admin.userId);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

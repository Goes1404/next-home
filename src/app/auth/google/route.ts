import { NextResponse, type NextRequest } from "next/server";
import { destinoSeguro } from "@/lib/auth/links";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * A volta do "Entrar com Google" (29/10/2026).
 *
 * O Google devolve `code` (PKCE): troca pela sessão. Depois a regra da Astro:
 * Google é só um JEITO DE ENTRAR, não um cadastro. Entra quem já tem conta —
 * ficha de corretor ativa ou administrador da plataforma. O Supabase liga a
 * identidade Google à conta que já existe com o mesmo e-mail verificado.
 *
 * Google de quem não tem conta: a sessão é fechada e, se o Supabase acabou de
 * criar um usuário só com a identidade Google (cadastro aberto no projeto),
 * ele é apagado — senão sobraria um login sem conta para sempre.
 *
 * Mora fora de `/corretor` (o proxy só exige sessão lá): quem chega aqui
 * ainda não tem sessão.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  if (!code) return irPara("/corretor/entrar?google=falhou");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const user = data?.user;
  if (error || !user) return irPara("/corretor/entrar?google=falhou");

  const [{ data: ficha }, { data: ehAdmin }] = await Promise.all([
    supabase.from("corretores").select("id, ativo").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("eh_admin_da_plataforma"),
  ]);

  if (!ficha?.ativo && ehAdmin !== true) {
    await supabase.auth.signOut();
    const soGoogle = (user.identities ?? []).every((i) => i.provider === "google");
    const recemCriado = Date.now() - new Date(user.created_at).getTime() < 5 * 60 * 1000;
    if (!ficha && soGoogle && recemCriado) {
      try {
        await createServiceClient().auth.admin.deleteUser(user.id);
      } catch (e) {
        console.warn("[google] login sem conta não apagado:", e instanceof Error ? e.message : e);
      }
    }
    return irPara("/corretor/entrar?google=sem-conta");
  }

  if (!ficha && ehAdmin === true && !next) return irPara("/plataforma");
  return irPara(destinoSeguro(next));
}

/** `Location` relativo, pelo mesmo motivo de `/auth/confirmar`. */
function irPara(caminho: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: caminho } });
}

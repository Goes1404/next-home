import { NextResponse, type NextRequest } from "next/server";
import { destinoSeguro } from "@/lib/auth/links";
import { senhaTrocadaEm, senhaVencida } from "@/lib/auth/politicaDeSenha";
import { DESTINO_SENHA_VENCIDA, registrarSenhaTrocada } from "@/lib/auth/validadeDaSenhaNoServidor";
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
    supabase.from("corretores").select("id, ativo, deve_trocar_senha").eq("user_id", user.id).maybeSingle(),
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

  // Os 90 dias da senha (revisão de 30/10/2026), como em `entrar`: quem só
  // entra com o Google também começa a contar no primeiro login (senão a
  // validade nunca começaria), e a sessão é renovada para o JWT trazer a
  // data. Vencida vai para a troca.
  const appMetadata = user.app_metadata as Record<string, unknown> | undefined;
  const trocada = senhaTrocadaEm(appMetadata);
  if (!trocada) {
    await registrarSenhaTrocada(user.id, appMetadata);
    await supabase.auth.refreshSession();
  } else if (senhaVencida(trocada)) {
    return irPara(DESTINO_SENHA_VENCIDA);
  }

  // A troca obrigatória, como em `entrar`: na ficha (`deve_trocar_senha`) e,
  // para o administrador sem ficha, no `app_metadata`.
  if (ficha?.deve_trocar_senha) return irPara("/corretor/senha");
  if (!ficha && appMetadata?.deve_trocar_senha === true) return irPara("/corretor/senha");

  if (!ficha && ehAdmin === true && !next) return irPara("/plataforma");
  return irPara(destinoSeguro(next));
}

/** `Location` relativo, pelo mesmo motivo de `/auth/confirmar`. */
function irPara(caminho: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: caminho } });
}

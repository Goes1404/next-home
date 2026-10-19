"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CAMINHO_DO_COOKIE, COOKIE_DO_LINK, DESTINO_DO_LINK_RUIM, lerCookieDoLink } from "@/lib/auth/linkPendente";
import { createClient } from "@/lib/supabase/server";

/**
 * O botão de `/auth/continuar`: aqui, e só aqui, o token do link é gasto.
 *
 * Roda num POST (server action), que os filtros de e-mail não fazem — por
 * isso o primeiro clique de verdade continua valendo mesmo depois de um Safe
 * Links ter aberto o link. O `verifyOtp` usa o cliente de cookies, então a
 * sessão nasce nesta mesma resposta.
 *
 * O cookie do link é apagado antes de verificar: ele vale uma tentativa,
 * como o próprio token. Link vencido, já usado ou sem cookie (outro
 * navegador, mais de 15 min) → tela de entrar com `?link=expirado`.
 */
export async function confirmarAcesso(): Promise<void> {
  const loja = await cookies();
  const link = lerCookieDoLink(loja.get(COOKIE_DO_LINK)?.value);
  loja.delete({ name: COOKIE_DO_LINK, path: CAMINHO_DO_COOKIE });
  if (!link) redirect(DESTINO_DO_LINK_RUIM);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: link.tipo, token_hash: link.tokenHash });
  if (error) redirect(DESTINO_DO_LINK_RUIM);

  redirect(link.next);
}

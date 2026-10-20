"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  CAMINHO_DO_BOTAO,
  CAMINHO_DO_COOKIE,
  COOKIE_DO_LINK,
  DESTINO_DO_LINK_RUIM,
  ehFalhaPassageiraDoAuth,
  lerCookieDoLink,
} from "@/lib/auth/linkPendente";
import { createClient } from "@/lib/supabase/server";

/**
 * O botão de `/auth/continuar`: aqui, e só aqui, o token do link é gasto.
 *
 * Roda num POST (server action), que os filtros de e-mail não fazem — por
 * isso o primeiro clique de verdade continua valendo mesmo depois de um Safe
 * Links ter aberto o link. O `verifyOtp` usa o cliente de cookies, então a
 * sessão nasce nesta mesma resposta.
 *
 * Link vencido, já usado ou inválido (4xx do Auth) e falta de cookie (outro
 * navegador, mais de 15 min) → o cookie sai e a pessoa vai para a tela de
 * entrar com `?link=expirado`. Falha PASSAGEIRA (rede, Auth fora, limite de
 * pedidos) não gastou o token: o cookie fica e a pessoa volta ao botão com
 * um aviso para tentar de novo — apagá-lo ali queimaria um link bom.
 *
 * Se o link disse para quem era (`email`) e a conta aberta é outra, a sessão
 * é fechada: o e-mail mostrado na tela do botão vem da URL, e só vale se o
 * token confirmar.
 */
export async function confirmarAcesso(): Promise<void> {
  const loja = await cookies();
  const apagarLink = () => loja.delete({ name: COOKIE_DO_LINK, path: CAMINHO_DO_COOKIE });
  const link = lerCookieDoLink(loja.get(COOKIE_DO_LINK)?.value);
  if (!link) {
    apagarLink();
    redirect(DESTINO_DO_LINK_RUIM);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: link.tipo, token_hash: link.tokenHash });
  if (error) {
    if (ehFalhaPassageiraDoAuth(error)) {
      console.warn(`[continuar] falha passageira ao confirmar o link: ${error.status ?? "sem status"} ${error.code ?? ""}`);
      redirect(`${CAMINHO_DO_BOTAO}?erro=tentar`);
    }
    apagarLink();
    redirect(DESTINO_DO_LINK_RUIM);
  }
  apagarLink();

  const emailDaConta = data?.user?.email?.toLowerCase();
  if (link.email && emailDaConta !== link.email) {
    console.error("[continuar] o link abriu uma conta diferente da que ele dizia; sessão fechada");
    await supabase.auth.signOut();
    redirect(DESTINO_DO_LINK_RUIM);
  }

  redirect(link.next);
}

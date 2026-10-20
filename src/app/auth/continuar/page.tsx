import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_DO_LINK, DESTINO_DO_LINK_RUIM, lerCookieDoLink } from "@/lib/auth/linkPendente";
import { createClient } from "@/lib/supabase/server";
import { confirmarAcesso } from "./acoes";
import { BotaoContinuar } from "./BotaoContinuar";

export const metadata: Metadata = {
  title: "Continuar",
  robots: { index: false, follow: false },
};

/**
 * A tela do botão, entre o link do e-mail e a sessão.
 *
 * Existe para os filtros de e-mail não gastarem o link: abrir esta tela não
 * verifica nada; só o botão (POST) verifica. Ver `src/lib/auth/linkPendente.ts`.
 *
 * Formulário HTML puro com server action: funciona sem JavaScript, como a
 * tela de "Esqueci a senha". Com JavaScript, o botão trava no primeiro toque.
 *
 * Diz QUAL conta o link abre (o e-mail que o link carrega) e, se o navegador
 * já tem outra conta aberta, que ela vai ser fechada — senão o gestor que
 * abre o próprio link no computador da imobiliária, com a sessão de um
 * colega, não entenderia por que entrou como outra pessoa.
 *
 * `?erro=tentar`: o botão voltou de uma falha passageira do Auth (rede,
 * limite de pedidos). O link continua valendo.
 */
export default async function ContinuarPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const link = lerCookieDoLink((await cookies()).get(COOKIE_DO_LINK)?.value);
  if (!link) redirect(DESTINO_DO_LINK_RUIM);
  const { erro } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const contaAberta = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : null;
  const outraContaAberta = contaAberta !== null && contaAberta !== link.email ? contaAberta : null;

  const convite = link.tipo === "invite";

  return (
    <main className="bg-fundo flex min-h-svh items-center justify-center px-5 py-10">
      <div className="border-linha bg-superficie shadow-painel-alto w-full max-w-sm rounded-2xl border p-6 sm:p-7">
        <h1 className="text-fluid-xl text-titulo font-medium">
          {convite ? "Aceitar o convite" : "Criar uma senha nova"}
        </h1>
        <p className="text-fluid-sm text-apoio mt-1 break-words">
          {convite
            ? "Toque em continuar para entrar no painel de corretores e criar a sua senha."
            : "Toque em continuar para criar uma senha nova para o painel de corretores."}
        </p>
        {link.email && (
          <p className="text-fluid-sm text-corpo mt-3 break-words">
            Este link abre a conta <strong className="text-titulo">{link.email}</strong>.
          </p>
        )}
        {outraContaAberta && (
          <p
            role="status"
            className="text-fluid-sm border-alerta-linha bg-alerta-lavado text-corpo mt-3 rounded-xl border px-3 py-2 break-words"
          >
            Neste navegador está aberta a conta <strong className="text-titulo">{outraContaAberta}</strong>. Ao
            continuar, ela é fechada e entra a conta do link.
          </p>
        )}
        {erro === "tentar" && (
          <p role="alert" className="text-fluid-sm text-perigo mt-3">
            Não deu para confirmar o link agora, por uma falha passageira. Ele continua valendo: toque em continuar de
            novo.
          </p>
        )}
        <form action={confirmarAcesso} className="mt-6">
          <BotaoContinuar />
        </form>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_DO_LINK, DESTINO_DO_LINK_RUIM, lerCookieDoLink } from "@/lib/auth/linkPendente";
import { confirmarAcesso } from "./acoes";

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
 * tela de "Esqueci a senha".
 */
export default async function ContinuarPage() {
  const link = lerCookieDoLink((await cookies()).get(COOKIE_DO_LINK)?.value);
  if (!link) redirect(DESTINO_DO_LINK_RUIM);

  const convite = link.tipo === "invite";

  return (
    <main className="bg-fundo flex min-h-svh items-center justify-center px-5 py-10">
      <div className="border-linha bg-superficie shadow-painel-alto w-full max-w-sm rounded-2xl border p-6 sm:p-7">
        <h1 className="text-fluid-xl text-titulo font-medium">
          {convite ? "Aceitar o convite" : "Criar uma senha nova"}
        </h1>
        <p className="text-fluid-sm text-apoio mt-1 mb-6">
          {convite
            ? "Toque em continuar para entrar no painel de corretores e criar a sua senha."
            : "Toque em continuar para criar uma senha nova para o painel de corretores."}
        </p>
        <form action={confirmarAcesso}>
          <button
            type="submit"
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base min-h-11 w-full rounded-full px-7 py-3.5 font-semibold transition-colors"
          >
            Continuar
          </button>
        </form>
      </div>
    </main>
  );
}

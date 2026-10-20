import type { Metadata } from "next";
import Link from "next/link";
import { pedirLinkDeSenha } from "./acoes";

export const metadata: Metadata = {
  title: "Esqueci a senha",
  robots: { index: false, follow: false },
};

const CAMPO =
  "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3.5 text-fluid-base text-titulo placeholder:text-tenue outline-none transition-colors focus:border-acento";

/**
 * Pede o link de recuperação de senha por e-mail.
 *
 * Formulário HTML simples, sem estado no cliente: a action sempre volta para
 * esta mesma tela com `?enviado=1`, e a frase é a mesma para qualquer
 * e-mail — exista ou não a conta (ver `acoes.ts`). Funciona sem JavaScript.
 */
export default async function EsqueciASenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ enviado?: string }>;
}) {
  const { enviado } = await searchParams;

  return (
    <main className="bg-fundo flex min-h-svh items-center justify-center px-5 py-10">
      <div className="border-linha bg-superficie shadow-painel-alto w-full max-w-sm rounded-2xl border p-6 sm:p-7">
        <h1 className="text-fluid-xl text-titulo font-medium">Esqueci a senha</h1>

        {enviado === "conta" ? (
          <p role="status" className="text-fluid-base text-corpo mt-4">
            Saímos do painel e mandamos um link novo para o e-mail da sua conta. Abra o e-mail e siga o link para
            criar a sua senha; ele só funciona uma vez.
          </p>
        ) : enviado ? (
          <p role="status" className="text-fluid-base text-corpo mt-4">
            Se houver uma conta com este e-mail, enviamos um link. Abra o e-mail e siga o link para criar uma senha
            nova; ele só funciona uma vez. Se você pediu há menos de um minuto, espere antes de pedir de novo.
          </p>
        ) : (
          <>
            <p className="text-fluid-sm text-apoio mt-1 mb-6">
              Digite o e-mail com que você entra no painel. Mandamos um link para você criar uma senha nova.
            </p>
            <form action={pedirLinkDeSenha} className="space-y-4">
              <div>
                <label htmlFor="email" className="text-fluid-sm mb-1.5 block text-corpo">
                  E-mail
                </label>
                <input id="email" name="email" type="email" required autoComplete="email" className={CAMPO} />
              </div>
              <button
                type="submit"
                className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base w-full rounded-full px-7 py-3.5 font-semibold transition-colors"
              >
                Mandar o link
              </button>
            </form>
          </>
        )}

        <Link
          href="/corretor/entrar"
          className="text-fluid-sm text-corpo hover:text-titulo mt-6 flex min-h-11 items-center justify-center underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
        >
          Voltar para entrar
        </Link>
      </div>
    </main>
  );
}

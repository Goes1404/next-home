import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FormularioDefinirSenha } from "./FormularioDefinirSenha";

export const metadata: Metadata = {
  title: "Criar senha",
  robots: { index: false, follow: false },
};

/**
 * Onde cai quem abriu o link do convite ou da recuperação de senha: o
 * `/auth/confirmar` já abriu a sessão, falta só escolher a senha.
 *
 * Fora do grupo `(painel)` de propósito: o menu e as faixas do painel não
 * servem a quem ainda nem tem senha. A sessão continua exigida (o
 * `proxy.ts` barra `/corretor/*` sem ela) — sem o link aberto não há o que
 * definir.
 */
export default async function DefinirSenhaPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (!data?.claims?.sub) redirect("/corretor/entrar");

  return (
    <main className="bg-fundo flex min-h-svh items-center justify-center px-5 py-10">
      <div className="border-linha bg-superficie shadow-painel-alto w-full max-w-sm rounded-2xl border p-6 sm:p-7">
        <h1 className="text-fluid-xl text-titulo font-medium">Crie sua senha</h1>
        <p className="text-fluid-sm text-apoio mt-1 mb-6 break-words">
          {email ? (
            <>
              Esta será a senha de <span className="text-corpo">{email}</span> no painel de corretores.
            </>
          ) : (
            "Esta será a sua senha no painel de corretores."
          )}
        </p>

        <FormularioDefinirSenha />
      </div>
    </main>
  );
}

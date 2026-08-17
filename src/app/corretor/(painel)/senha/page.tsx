import type { Metadata } from "next";
import { FormularioSenha } from "./FormularioSenha";
import { getEmailLogado } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Senha" };

export default async function SenhaPage() {
  const email = await getEmailLogado();

  return (
    <div>
      <h1 className="text-fluid-2xl text-mist-50">Trocar senha</h1>
      {email && (
        <p className="text-fluid-sm mt-2 text-mist-400">
          Conta <span className="text-mist-200">{email}</span>.
        </p>
      )}

      <div className="mt-8 max-w-md rounded-2xl border border-white/10 bg-ink-900/50 p-6 sm:p-7">
        <FormularioSenha />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { FormularioSenha } from "./FormularioSenha";
import { getEmailLogado } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Senha" };

export default async function SenhaPage() {
  const email = await getEmailLogado();

  return (
    <div>
      <h1 className="text-fluid-2xl text-titulo">Trocar senha</h1>
      {email && (
        <p className="text-fluid-sm mt-2 text-apoio">
          Conta <span className="text-corpo">{email}</span>.
        </p>
      )}

      <div className="mt-8 max-w-md rounded-2xl border border-linha bg-superficie p-6 sm:p-7">
        <FormularioSenha />
      </div>
    </div>
  );
}

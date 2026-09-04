import type { Metadata } from "next";
import { FormularioSenha } from "./FormularioSenha";
import { getEmailLogado } from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Senha" };

export default async function SenhaPage() {
  const email = await getEmailLogado();

  return (
    <div>
      <CabecalhoDeTela secao="Conta" titulo="Trocar senha" descricao={email && <>Conta <span className="text-corpo">{email}</span>.</>} />

      <div className="cartao mt-8 max-w-md p-6 sm:p-7">
        <FormularioSenha />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { FormularioSenha } from "./FormularioSenha";
import { getEmailLogado } from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Senha" };

/**
 * `?link=vencido`: veio de `/corretor/definir-senha` com uma sessão que não é
 * a do link recém-aberto (`sessaoAbertaPorLink`). Quem foi convidado não tem
 * senha atual para digitar aqui — a frase diz como sair do beco.
 */
export default async function SenhaPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const email = await getEmailLogado();
  const { link } = await searchParams;

  return (
    <div>
      <CabecalhoDeTela secao="Conta" titulo="Trocar senha" descricao={email && <>Conta <span className="text-corpo">{email}</span>.</>} />

      {link === "vencido" && (
        <p role="status" className="text-fluid-sm border-linha bg-superficie text-corpo mt-6 max-w-md rounded-xl border px-4 py-3">
          O link de acesso vale 15 minutos depois de aberto. Se você ainda não tem senha, saia e peça outro link em
          &ldquo;Esqueci a senha&rdquo;, na tela de entrar.
        </p>
      )}

      <div className="cartao mt-8 max-w-md p-6 sm:p-7">
        <FormularioSenha />
      </div>
    </div>
  );
}

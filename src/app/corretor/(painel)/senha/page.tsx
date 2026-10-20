import type { Metadata } from "next";
import { FormularioSenha } from "./FormularioSenha";
import { getEmailLogado } from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { sairEReceberNovoLink } from "./acoes";

export const metadata: Metadata = { title: "Senha" };

/**
 * `?link=vencido`: veio de `/corretor/definir-senha` com uma sessão que não é
 * a do link recém-aberto (`sessaoAbertaPorLink`). Quem foi convidado não tem
 * senha atual para digitar aqui — o botão "Sair e receber novo link" é a
 * saída: manda o link para o e-mail da conta e fecha a sessão.
 *
 * `?pedido=espera|falhou`: o botão voltou sem mandar o link (limite de
 * pedidos, ou o e-mail não saiu). A sessão continua aberta.
 */
export default async function SenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string; pedido?: string }>;
}) {
  const email = await getEmailLogado();
  const { link, pedido } = await searchParams;

  return (
    <div>
      <CabecalhoDeTela secao="Conta" titulo="Trocar senha" descricao={email && <>Conta <span className="text-corpo">{email}</span>.</>} />

      {link === "vencido" && (
        <div role="status" className="text-fluid-sm border-linha bg-superficie text-corpo mt-6 max-w-md rounded-xl border px-4 py-3">
          <p>
            O link de acesso vale 15 minutos depois de aberto. Se você ainda não criou a sua senha, não há senha atual
            para digitar aqui: toque no botão abaixo. Mandamos um link novo para o e-mail desta conta e saímos do
            painel; abra o e-mail e crie a senha pelo link.
          </p>
          {pedido === "espera" && (
            <p role="alert" className="text-perigo mt-2">
              Você acabou de pedir um link. Espere um minuto (ou confira o e-mail, ele pode já ter chegado) antes de
              pedir de novo.
            </p>
          )}
          {pedido === "falhou" && (
            <p role="alert" className="text-perigo mt-2">
              Não deu para mandar o link agora. Tente de novo em alguns minutos, ou peça a quem administra a
              imobiliária para reenviar o convite.
            </p>
          )}
          <form action={sairEReceberNovoLink} className="mt-3">
            <button
              type="submit"
              className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm min-h-11 rounded-full px-5 py-2.5 font-semibold transition-colors"
            >
              Sair e receber novo link
            </button>
          </form>
        </div>
      )}

      <div className="cartao mt-8 max-w-md p-6 sm:p-7">
        <FormularioSenha />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { FormularioSenha } from "./FormularioSenha";
import { getEmailLogado } from "@/lib/corretorSessao";
import { sairEReceberNovoLink } from "./acoes";

export const metadata: Metadata = {
  title: "Trocar senha",
  robots: { index: false, follow: false },
};

/**
 * `?link=vencido`: veio de `/corretor/definir-senha` com uma sessão que não é
 * a do link recém-aberto (`sessaoAbertaPorLink`). Quem foi convidado não tem
 * senha atual para digitar aqui — o botão "Sair e receber novo link" é a
 * saída: manda o link para o e-mail da conta e fecha a sessão.
 *
 * `?pedido=espera|falhou`: o botão voltou sem mandar o link (limite de
 * pedidos, ou o e-mail não saiu). A sessão continua aberta.
 *
 * Fora do grupo `(painel)` de propósito (fase 2D): o layout do painel manda
 * para os termos quem ainda não aceitou, e trocar a senha provisória é uma
 * ação de segurança que não pode esperar o aceite. A sessão continua exigida
 * (`proxy.ts`). Fora do grupo também quer dizer sem o menu: ao sair daqui
 * para o painel, o layout dele roda e confere os termos.
 */
export default async function SenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string; pedido?: string }>;
}) {
  const email = await getEmailLogado();
  const { link, pedido } = await searchParams;

  return (
    <main className="bg-fundo flex min-h-svh justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-fluid-xs text-tenue tracking-wide uppercase">Conta</p>
        <h1 className="text-fluid-xl text-titulo mt-1 font-medium">Trocar senha</h1>
        {email && (
          <p className="text-fluid-sm text-apoio mt-2 break-words">
            Conta <span className="text-corpo">{email}</span>.
          </p>
        )}

        {link === "vencido" && (
          <div
            role="status"
            className="text-fluid-sm border-linha bg-superficie text-corpo mt-6 max-w-md rounded-xl border px-4 py-3"
          >
            <p>
              O link de acesso vale 15 minutos depois de aberto. Se você ainda não criou
              a sua senha, não há senha atual para digitar aqui: toque no botão abaixo.
              Mandamos um link novo para o e-mail desta conta e saímos do painel; abra o
              e-mail e crie a senha pelo link.
            </p>
            {pedido === "espera" && (
              <p role="alert" className="text-perigo mt-2">
                Você acabou de pedir um link. Espere um minuto (ou confira o e-mail, ele
                pode já ter chegado) antes de pedir de novo.
              </p>
            )}
            {pedido === "falhou" && (
              <p role="alert" className="text-perigo mt-2">
                Não deu para mandar o link agora. Tente de novo em alguns minutos, ou
                peça a quem administra a imobiliária para reenviar o convite.
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

        <Link
          href="/corretor"
          className="link-acao text-fluid-sm text-corpo mt-6 inline-flex min-h-11 items-center"
        >
          Voltar ao painel
        </Link>
      </div>
    </main>
  );
}

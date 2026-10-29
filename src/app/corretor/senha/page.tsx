import type { Metadata } from "next";
import { FormularioSenha } from "./FormularioSenha";
import { getEmailLogado } from "@/lib/corretorSessao";
import { sairEReceberNovoLink } from "./acoes";
import { LinkDaFolha, TelaDeAcesso } from "../TelaDeAcesso";

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

  const avisoDoLink =
    link === "vencido" ? (
      <>
        <p>
          O link de acesso vale 15 minutos depois de aberto. Se você ainda não criou a sua senha, não há senha atual
          para digitar aqui: toque no botão abaixo. Mandamos um link novo para o e-mail desta conta e saímos do
          painel; abra o e-mail e crie a senha pelo link.
        </p>
        {pedido === "espera" && (
          <p className="text-perigo mt-2">
            Você acabou de pedir um link. Espere um minuto (ou confira o e-mail, ele pode já ter chegado) antes de
            pedir de novo.
          </p>
        )}
        {pedido === "falhou" && (
          <p className="text-perigo mt-2">
            Não deu para mandar o link agora. Tente de novo em alguns minutos, ou peça a quem administra a
            imobiliária para reenviar o convite.
          </p>
        )}
        <form action={sairEReceberNovoLink} className="mt-3">
          <button
            type="submit"
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm min-h-11 w-full rounded-full px-5 py-2.5 font-semibold transition-colors"
          >
            Sair e receber novo link
          </button>
        </form>
      </>
    ) : undefined;

  return (
    <TelaDeAcesso
      titulo="Trocar senha"
      apoio={
        email ? (
          <span className="break-words">
            Conta <strong className="font-semibold">{email}</strong>
          </span>
        ) : undefined
      }
      chamada="Sua conta, protegida."
      textoDaChamada="Use uma senha que você não usa em outros sites."
      aviso={avisoDoLink}
      rodape={<LinkDaFolha href="/corretor">Voltar ao painel</LinkDaFolha>}
    >
      <FormularioSenha />
    </TelaDeAcesso>
  );
}

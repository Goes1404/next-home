import type { Metadata, Viewport } from "next";
import { BotaoDeAcesso, CampoDeAcesso, CLASSE_DO_FORMULARIO } from "../CampoDeAcesso";
import { COR_DA_BARRA_DO_ACESSO } from "../ComportamentoDeApp";
import { LinkDaFolha, TelaDeAcesso } from "../TelaDeAcesso";
import { pedirLinkDeSenha } from "./acoes";

export const metadata: Metadata = {
  title: { absolute: "Esqueci a senha · Astro Soluções" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: COR_DA_BARRA_DO_ACESSO };

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
    <TelaDeAcesso
      titulo="Esqueci a senha"
      apoio={enviado ? undefined : "Mandamos um link para você criar uma senha nova."}
      chamada="Vamos recuperar seu acesso."
      textoDaChamada="Em um minuto você volta para os seus leads."
      rodape={<LinkDaFolha href="/corretor/entrar">Voltar para entrar</LinkDaFolha>}
    >
      {enviado === "conta" ? (
        <p role="status" className="text-fluid-sm text-corpo">
          Saímos do painel e mandamos um link novo para o e-mail da sua conta. Abra o e-mail e siga o link para criar
          a sua senha; ele só funciona uma vez.
        </p>
      ) : enviado ? (
        <p role="status" className="text-fluid-sm text-corpo">
          Se houver uma conta com este e-mail, enviamos um link. Abra o e-mail e siga o link para criar uma senha
          nova; ele só funciona uma vez. Se você pediu há menos de um minuto, espere antes de pedir de novo.
        </p>
      ) : (
        <form action={pedirLinkDeSenha} className={CLASSE_DO_FORMULARIO}>
          <CampoDeAcesso id="email" name="email" rotulo="E-mail" tipo="email" autoComplete="email" />
          <BotaoDeAcesso enviando="Mandando…">Mandar o link</BotaoDeAcesso>
        </form>
      )}
    </TelaDeAcesso>
  );
}

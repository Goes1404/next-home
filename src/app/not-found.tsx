import type { Metadata } from "next";

/**
 * A página neutra: endereço que não é de nenhum grupo, grupo encerrado e
 * página que não existe (fase 3, 20/10/2026).
 *
 * Neutra de propósito — sem logotipo, nome, telefone nem link de WhatsApp de
 * grupo nenhum. Um domínio apontado para a plataforma sem estar cadastrado
 * não pode mostrar o site (nem o contato) da Next Home, e o 404 de um site
 * de cliente não pode levar o visitante para outra imobiliária.
 */
export const metadata: Metadata = {
  title: { absolute: "Página não encontrada" },
  robots: { index: false, follow: false },
};

export default function NaoEncontrada() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-fundo px-4 py-16">
      <div className="max-w-md text-center">
        <p className="text-fluid-xs font-medium uppercase tracking-[0.2em] text-tenue">Erro 404</p>
        <h1 className="mt-3 font-display text-fluid-2xl text-titulo">Página não encontrada</h1>
        <p className="mt-4 text-fluid-sm text-corpo">
          Não há nada publicado neste endereço. Confira se o link foi digitado certo ou peça um novo a quem o enviou.
        </p>
      </div>
    </main>
  );
}

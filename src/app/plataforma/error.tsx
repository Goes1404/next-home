"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

/**
 * Tela de erro do painel da plataforma (04/11/2026).
 *
 * Sem ela, qualquer erro no painel caía no erro global do Next, a tela preta
 * "This page couldn't load", que some com a navegação inteira. O caso que a
 * motivou: no celular, voltar do WhatsApp para a aba Prospecção com uma
 * requisição cortada no meio. Aqui o erro fica dentro do painel, com o menu
 * no lugar e um botão que busca a página de novo.
 */
export default function ErroDaPlataforma({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Erro no painel da plataforma:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="border-alerta-linha bg-alerta-lavado mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </div>

      <h1 className="text-fluid-xl text-titulo font-bold">Não conseguimos carregar esta página</h1>

      <p className="text-fluid-sm text-apoio mt-3 leading-relaxed">
        Nada foi perdido. Normalmente é a conexão que caiu no meio do caminho, por exemplo ao voltar de outro aplicativo. Tente de novo.
      </p>

      {error.digest && <p className="text-tenue mt-4 font-mono text-[11px]">Código: {error.digest}</p>}

      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="bg-acento text-fluid-xs text-sobre-cor hover:bg-acento-hover min-h-11 cursor-pointer rounded-xl px-5 py-2.5 font-bold transition-colors"
        >
          Tentar de novo
        </button>
        <Link
          href="/plataforma"
          className="bg-vidro-forte text-fluid-xs text-corpo hover:bg-vidro-mais inline-flex min-h-11 items-center rounded-xl px-5 py-2.5 font-semibold transition-colors"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

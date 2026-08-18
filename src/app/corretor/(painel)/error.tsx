"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Tela de erro do painel do corretor.
 *
 * Existe para que uma consulta que falha tenha onde aparecer. A alternativa
 * — devolver lista vazia quando a query quebra — é pior do que parece num
 * CRM: "0 leads" é indistinguível de "sua carteira sumiu", e o corretor não
 * tem como saber que deveria avisar alguém.
 *
 * Aqui o erro fica visível para quem usa (com um caminho de saída) e
 * completo no log do servidor, que é onde ele conserta.
 */
export default function ErroPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Erro no painel do corretor:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-alerta-linha bg-alerta-lavado text-2xl">
        ⚠️
      </div>

      <h1 className="text-fluid-xl font-bold text-titulo">
        Não conseguimos carregar esta página
      </h1>

      <p className="text-fluid-sm mt-3 text-apoio leading-relaxed">
        Seus dados estão a salvo — foi a consulta que falhou, não o cadastro.
        Tente de novo; se continuar, avise o suporte com o código abaixo.
      </p>

      {error.digest && (
        <p className="mt-4 font-mono text-[11px] text-tenue">
          Código: {error.digest}
        </p>
      )}

      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="cursor-pointer rounded-xl bg-acento px-5 py-2.5 text-fluid-xs font-bold text-white transition-colors hover:bg-acento-hover"
        >
          Tentar novamente
        </button>
        <Link
          href="/corretor"
          className="rounded-xl bg-vidro-forte px-5 py-2.5 text-fluid-xs font-semibold text-corpo transition-colors hover:bg-vidro-mais"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { linkWhatsapp } from "@/lib/site";

/**
 * Cobre a listagem e as páginas de empreendimento.
 *
 * Se o Supabase cair, o pior resultado não é a tela de erro — é o visitante
 * interessado ficar sem nenhum caminho até um corretor. Por isso o WhatsApp
 * aparece aqui como saída, não só o "tentar de novo".
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha ao carregar empreendimentos:", error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center bg-fundo px-4 text-center">
      <p className="text-fluid-xs font-medium tracking-[0.2em] text-acento-suave uppercase">
        Next Home
      </p>
      <h1 className="text-fluid-2xl mt-4 max-w-lg text-titulo">
        Não conseguimos carregar os empreendimentos agora.
      </h1>
      <p className="text-fluid-base mt-3 max-w-md text-apoio">
        É uma falha temporária nossa, não do seu acesso. Tente de novo em
        instantes — ou fale direto com um corretor.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400"
        >
          Tentar de novo
        </button>
        <a
          href={linkWhatsapp()}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-linha/15 px-6 py-3 text-sm font-medium text-corpo transition-colors hover:border-linha/30"
        >
          Falar no WhatsApp
        </a>
      </div>

      <Link
        href="/"
        className="text-fluid-sm mt-8 text-legenda underline-offset-4 hover:text-corpo hover:underline"
      >
        Voltar para a home
      </Link>

      {error.digest && (
        <p className="text-fluid-xs mt-10 text-tenue">Código: {error.digest}</p>
      )}
    </main>
  );
}

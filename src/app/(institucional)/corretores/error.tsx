"use client";

import Link from "next/link";
import { useEffect } from "react";
import { linkWhatsapp } from "@/lib/site";

/**
 * Cobre a vitrine da equipe e a página de cada corretor.
 *
 * Mesma escolha do `error.tsx` dos empreendimentos: numa página cujo objetivo
 * é levar alguém a falar com um corretor, a tela de erro sem um caminho até o
 * WhatsApp perde exatamente o visitante que estava mais perto de virar
 * cliente. O "tentar de novo" fica, mas não sozinho.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Falha ao carregar corretores:", error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center px-4 text-center">
      <p className="text-fluid-xs text-brand-200 font-medium tracking-[0.2em] uppercase">
        Next Home
      </p>
      <h1 className="text-fluid-2xl mt-4 max-w-lg text-mist-50">
        Não conseguimos carregar a equipe agora.
      </h1>
      <p className="text-fluid-base mt-3 max-w-md text-mist-300">
        É uma falha temporária nossa, não do seu acesso. Tente de novo em instantes — ou
        fale direto com um corretor pela linha geral.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="bg-brand-500 hover:bg-brand-400 h-12 rounded-full px-6 text-sm font-medium text-white transition-colors"
        >
          Tentar de novo
        </button>
        <a
          href={linkWhatsapp()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center rounded-full border border-white/15 px-6 text-sm font-medium text-mist-100 transition-colors hover:border-white/30"
        >
          Falar no WhatsApp
        </a>
      </div>

      <Link
        href="/"
        className="text-fluid-sm mt-8 text-mist-400 underline-offset-4 hover:text-mist-100 hover:underline"
      >
        Voltar para a home
      </Link>

      {error.digest && (
        <p className="text-fluid-xs mt-10 text-mist-500">Código: {error.digest}</p>
      )}
    </main>
  );
}

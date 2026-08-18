import type { Metadata } from "next";
import Link from "next/link";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

/**
 * Login do corretor — área utilitária, sem o vídeo/vidro da vitrine
 * pública (mesmo tratamento visual simples de loading.tsx/error.tsx).
 */
export default function EntrarPage() {
  return (
    <main className="bg-fundo flex min-h-svh flex-1 flex-col items-center justify-center px-4">
      <div className="border-linha bg-superficie shadow-painel w-full max-w-sm rounded-2xl border p-7">
        <Link href="/" className="font-display inline-block text-lg text-titulo">
          Next<span className="text-acento-suave">Home</span>
        </Link>
        <p className="text-fluid-sm mt-1 mb-6 text-apoio">Área do corretor</p>

        <FormularioLogin />
      </div>
    </main>
  );
}

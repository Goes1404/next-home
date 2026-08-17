import type { Metadata } from "next";
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
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900/50 p-7">
        <p className="font-display text-lg text-mist-50">
          Next<span className="text-brand-300">Home</span>
        </p>
        <p className="text-fluid-sm mt-1 mb-6 text-mist-400">Área do corretor</p>

        <FormularioLogin />
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

/**
 * Login do corretor — área utilitária, agora com imagem de fundo estilizada.
 */
export default function EntrarPage() {
  return (
    <main className="bg-fundo flex min-h-svh flex-1 flex-col items-center justify-center px-4 relative overflow-hidden">
      <Image
        src="/img/burj-login-bg.jpg"
        alt="Burj Khalifa"
        fill
        priority
        className="object-cover opacity-50 mix-blend-overlay"
      />
      <div className="absolute inset-0 bg-fundo/70" />

      <div className="relative z-10 border-linha bg-superficie shadow-painel w-full max-w-sm rounded-2xl border p-7 backdrop-blur-sm">
        <Link href="/" className="font-display inline-block text-lg text-titulo">
          Next<span className="text-acento-suave">Home</span>
        </Link>
        <p className="text-fluid-sm mt-1 mb-6 text-apoio">Área do corretor</p>

        <FormularioLogin />
      </div>
    </main>
  );
}

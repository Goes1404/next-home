import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FormularioPerfil } from "./FormularioPerfil";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { iniciais } from "@/lib/format";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function PerfilPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  return (
    // Formulário se cansa de ler antes de o painel acabar: campo de texto
    // largo demais é tão ruim quanto estreito demais.
    <div className="max-w-2xl">
      <h1 className="text-fluid-2xl text-mist-50">Meu perfil</h1>
      <p className="text-fluid-sm mt-2 text-mist-400">
        O que o cliente vê na sua{" "}
        <Link
          href={`/corretores/${corretor.slug}`}
          className="text-brand-200 underline-offset-4 hover:underline"
        >
          página pública
        </Link>
        .
      </p>

      <div className="mt-8 flex items-center gap-4 rounded-2xl border border-white/10 bg-ink-900/50 p-5">
        {corretor.fotoUrl ? (
          <Image
            src={corretor.fotoUrl}
            alt=""
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="font-display flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg text-mist-50"
          >
            {iniciais(corretor.nome)}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-fluid-sm text-mist-300">CRECI {corretor.creci}</p>
          <p className="text-fluid-xs mt-0.5 text-mist-500">
            CRECI e foto são alterados pelo administrador do site.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-ink-900/50 p-6 sm:p-7">
        <FormularioPerfil corretor={corretor} />
      </div>
    </div>
  );
}

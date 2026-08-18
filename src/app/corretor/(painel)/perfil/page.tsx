import type { Metadata } from "next";
import Link from "next/link";
import { EditorAvatar } from "./EditorAvatar";
import { FormularioPerfil } from "./FormularioPerfil";
import { FundoLink } from "./FundoLink";
import { getCorretorLogado } from "@/lib/corretorSessao";

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

      <div className="mt-8 rounded-2xl border border-brand-400/20 bg-gradient-to-r from-brand-950/40 via-ink-900/60 to-ink-900/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
        <EditorAvatar nome={corretor.nome} fotoUrl={corretor.fotoUrl} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-500/20 border border-brand-400/30 px-2.5 py-0.5 text-fluid-xs font-semibold text-brand-200">
            CRECI {corretor.creci}
          </span>
          <span className="rounded-full bg-azure-500/20 border border-azure-400/30 px-2.5 py-0.5 text-fluid-xs font-medium text-azure-200">
            Perfil Público Ativo
          </span>
        </div>
        <p className="text-fluid-xs mt-2 text-mist-400">
          O CRECI é gerenciado pela administração da Next Home.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-ink-900/50 p-6 sm:p-7">
        <FundoLink fundoTipo={corretor.fundoTipo} />
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-ink-900/50 p-6 sm:p-7">
        <FormularioPerfil corretor={corretor} />
      </div>
    </div>
  );
}

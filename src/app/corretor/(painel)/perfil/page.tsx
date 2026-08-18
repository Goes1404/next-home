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
      <h1 className="text-fluid-2xl text-titulo">Meu perfil</h1>
      <p className="text-fluid-sm mt-2 text-apoio">
        O que o cliente vê na sua{" "}
        <Link
          href={`/corretores/${corretor.slug}`}
          className="text-acento-suave underline-offset-4 hover:underline"
        >
          página pública
        </Link>
        .
      </p>

      <div className="border-acento-linha bg-superficie shadow-painel mt-8 rounded-2xl border p-5">
        <EditorAvatar nome={corretor.nome} fotoUrl={corretor.fotoUrl} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-acento-lavado border border-acento-linha px-2.5 py-0.5 text-fluid-xs font-semibold text-acento-suave">
            CRECI {corretor.creci}
          </span>
          <span className="rounded-full bg-etapa-azul-lavado border border-etapa-azul-linha px-2.5 py-0.5 text-fluid-xs font-medium text-etapa-azul">
            Perfil Público Ativo
          </span>
        </div>
        <p className="text-fluid-xs mt-2 text-apoio">
          O CRECI é gerenciado pela administração da Next Home.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-linha bg-superficie p-6 sm:p-7">
        <FundoLink fundoTipo={corretor.fundoTipo} />
      </div>

      <div className="mt-6 rounded-2xl border border-linha bg-superficie p-6 sm:p-7">
        <FormularioPerfil corretor={corretor} />
      </div>
    </div>
  );
}

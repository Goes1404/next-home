import { notFound } from "next/navigation";
import { getEmpreendimentoBySlug } from "@/lib/queries";
import { EditorImovelClient } from "../_componentes/EditorImovelClient";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const imovel = await getEmpreendimentoBySlug(slug);
  return {
    title: imovel ? `Editar: ${imovel.nome} | Painel do Corretor` : "Editar Imóvel",
  };
}

export const dynamic = "force-dynamic";

export default async function EditarImovelPage({ params }: Props) {
  const { slug } = await params;
  const imovel = await getEmpreendimentoBySlug(slug);

  if (!imovel) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header do Editor */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/corretor/imoveis"
              className="text-fluid-xs text-mist-400 hover:text-white transition-colors"
            >
              ← Todos os Imóveis
            </Link>
            <span className="text-mist-600">•</span>
            <span className="text-fluid-xs text-brand-300 font-semibold">
              Edição Mobile-First
            </span>
          </div>
          <h1 className="text-fluid-xl font-bold text-mist-50">{imovel.nome}</h1>
          <p className="text-fluid-xs text-mist-400">
            {imovel.bairro}, {imovel.cidade} • {imovel.midias?.length || imovel.galeria?.length || 0} fotos cadastradas
          </p>
        </div>

        <Link
          href={`/empreendimentos/${imovel.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[44px] px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-mist-200 hover:text-white text-fluid-xs font-semibold transition-colors flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <span>👁️ Ver Página Pública</span>
          <span>↗</span>
        </Link>
      </div>

      <EditorImovelClient imovel={imovel} />
    </div>
  );
}

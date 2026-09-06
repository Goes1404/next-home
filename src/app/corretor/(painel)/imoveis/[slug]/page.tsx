import { notFound } from "next/navigation";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { EditorImovelClient } from "../_componentes/EditorImovelClient";
import Link from "next/link";

interface Props {
  params: Promise<{ slug: string }>;
}

/*
 * Lê pelo catálogo DO PAINEL, nunca pela consulta da vitrine.
 *
 * `getEmpreendimentoBySlug` (lib/queries) filtra `publicado = true` — é a
 * leitura do site. Usá-la aqui fazia o imóvel recém-criado, que nasce
 * despublicado de propósito, cair em `notFound()`: o corretor preenchia o
 * formulário, o cadastro ENTRAVA no banco e a tela seguinte dizia que não
 * existia. Relatado em 04/09/2026 como "erro na criação do imóvel"; o
 * cadastro "teste" de 03/09 ficou no banco por causa disso.
 *
 * `getEmpreendimentoDoPainel` existe desde a 0081 com esse comentário no
 * corpo — só nunca foi ligada aqui. Quem autoriza ler o não publicado é a
 * policy daquela migration.
 */
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const imovel = await getEmpreendimentoDoPainel(slug);
  return {
    title: imovel ? `Editar: ${imovel.nome} | Painel do Corretor` : "Editar Imóvel",
  };
}

export const dynamic = "force-dynamic";

export default async function EditarImovelPage({ params }: Props) {
  const { slug } = await params;
  const imovel = await getEmpreendimentoDoPainel(slug);

  if (!imovel) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header do Editor */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-linha pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/corretor/imoveis"
              className="text-fluid-xs text-apoio hover:text-titulo transition-colors"
            >
              ← Todos os Imóveis
            </Link>
            <span className="text-tenue">•</span>
            <span className="text-fluid-xs text-acento-suave font-semibold">
              Edição Mobile-First
            </span>
          </div>
          <h1 className="text-fluid-xl font-bold text-titulo">{imovel.nome}</h1>
          <p className="text-fluid-xs text-apoio">
            {imovel.bairro}, {imovel.cidade} • {imovel.midias?.length || imovel.galeria?.length || 0} fotos cadastradas
          </p>
        </div>

        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <Link
            href={`/corretor/imoveis/${imovel.slug}/importar`}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-acento hover:bg-acento-hover text-sobre-cor text-fluid-xs font-bold transition-colors flex items-center justify-center gap-2"
          >
            <span>📥 Importar material</span>
          </Link>

          {/* O carrossel só faz sentido com foto — sem ela, os slides
              sairiam todos em fundo chapado. */}
          {(imovel.galeria?.length ?? 0) > 0 && (
            <Link
              href={`/corretor/imoveis/${imovel.slug}/carrossel`}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-vidro-forte hover:bg-vidro-mais text-corpo hover:text-titulo text-fluid-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <span>📸 Carrossel do Instagram</span>
            </Link>
          )}

          <Link
            href={`/empreendimentos/${imovel.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2 rounded-xl bg-vidro-forte hover:bg-vidro-mais text-corpo hover:text-titulo text-fluid-xs font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <span>👁️ Ver Página Pública</span>
            <span>↗</span>
          </Link>
        </div>
      </div>

      <EditorImovelClient imovel={imovel} />
    </div>
  );
}

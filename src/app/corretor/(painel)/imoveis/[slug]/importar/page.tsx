import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmpreendimentoBySlug } from "@/lib/queries";
import { ImportarClient } from "./ImportarClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const imovel = await getEmpreendimentoBySlug(slug);
  return {
    title: imovel ? `Importar material: ${imovel.nome} | Painel do Corretor` : "Importar material",
  };
}

export const dynamic = "force-dynamic";

export default async function ImportarMaterialPage({ params }: Props) {
  const { slug } = await params;
  const imovel = await getEmpreendimentoBySlug(slug);

  // `id` é opcional no tipo porque a vitrine também monta empreendimento a
  // partir de dado estático. Sem id não há pasta no Storage nem linha em
  // `midias` para escrever — importar seria impossível, então a tela não abre.
  if (!imovel?.id) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Link href={`/corretor/imoveis/${slug}`} className="text-fluid-xs text-apoio">
        ← Voltar para o imóvel
      </Link>

      <ImportarClient empreendimentoId={imovel.id} slug={slug} nome={imovel.nome} />
    </div>
  );
}

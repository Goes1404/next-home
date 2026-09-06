import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { ImportarClient } from "./ImportarClient";

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
    title: imovel ? `Importar material: ${imovel.nome} | Painel do Corretor` : "Importar material",
  };
}

export const dynamic = "force-dynamic";

export default async function ImportarMaterialPage({ params }: Props) {
  const { slug } = await params;
  const imovel = await getEmpreendimentoDoPainel(slug);

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

      <ImportarClient
        empreendimentoId={imovel.id}
        slug={slug}
        nome={imovel.nome}
        cadastroAtual={{
          nome: imovel.nome,
          construtora: imovel.construtora,
          cidade: imovel.cidade,
          bairro: imovel.bairro,
          endereco: imovel.endereco,
          status: imovel.status,
          entregaPrevista: imovel.entregaPrevista,
          totalTorres: imovel.totalTorres,
          totalAndares: imovel.totalAndares,
          totalUnidades: imovel.totalUnidades,
          tagline: imovel.tagline,
          descricao: imovel.descricao,
        }}
      />
    </div>
  );
}

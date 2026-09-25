import Link from "next/link";
import { notFound } from "next/navigation";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { createClient } from "@/lib/supabase/server";
import { ImportarClient } from "./ImportarClient";

interface Props {
  params: Promise<{ slug: string }>;
  /** `?site=` vem do cadastro de imóvel novo pelo link da construtora. */
  searchParams?: Promise<{ site?: string }>;
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

/**
 * O link guardado na última leitura do site (0113). Consulta à parte, e não
 * no SELECT do catálogo: antes de a coluna existir, a tela perde só o atalho
 * "Buscar novidades" — citar a coluna no SELECT derrubaria a tela inteira.
 */
async function siteGuardado(empreendimentoId: string): Promise<string | undefined> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("empreendimentos")
    .select("site_construtora")
    .eq("id", empreendimentoId)
    .maybeSingle();
  if (error) return undefined;
  return data?.site_construtora ?? undefined;
}

export default async function ImportarMaterialPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const site = (await searchParams)?.site;
  const imovel = await getEmpreendimentoDoPainel(slug);

  // `id` é opcional no tipo porque a vitrine também monta empreendimento a
  // partir de dado estático. Sem id não há pasta no Storage nem linha em
  // `midias` para escrever — importar seria impossível, então a tela não abre.
  if (!imovel?.id) {
    notFound();
  }
  const siteSalvo = await siteGuardado(imovel.id);

  return (
    <div className="space-y-6">
      <Link href={`/corretor/imoveis/${slug}`} className="text-fluid-xs text-apoio hover:text-titulo inline-flex min-h-9 items-center underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current">
        ← Voltar para o imóvel
      </Link>

      <ImportarClient
        empreendimentoId={imovel.id}
        slug={slug}
        nome={imovel.nome}
        linkDoSite={typeof site === "string" ? site : undefined}
        siteSalvo={siteSalvo}
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

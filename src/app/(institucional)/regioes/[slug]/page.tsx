import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { CtaFinal } from "@/components/home/CtaFinal";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { getEmpreendimentos } from "@/lib/queries";
import { REGIOES, regiaoPorSlug, regioesComEstoque } from "@/lib/regioes";
import { site } from "@/lib/site";

/**
 * A página de uma REGIÃO — o destino dos cartões da home.
 *
 * ## Por que região e não bairro
 *
 * `docs/MEMORIA.md` registra a medição que descarta a página por bairro: ~25
 * imóveis em 18 bairros, a maioria com UM. Dezoito páginas de um imóvel cada
 * é o caminho conhecido para o Google tratar o site como conteúdo fino. O
 * agrupamento que TEM inventário é o desta lista (ver `lib/regioes.ts`), e
 * região sem imóvel devolve 404 em vez de uma página vazia com a marca em
 * cima.
 *
 * ## O que ela responde, que a listagem filtrada não responde
 *
 * A listagem mostra cards. Esta página abre com o que alguém quer saber ANTES
 * de olhar imóvel: quantos há, a partir de quanto, e em que bairros. São três
 * números do próprio catálogo — nada aqui é escrito à mão sobre estoque.
 */

type Props = { params: Promise<{ slug: string }> };

/** As regiões declaradas viram rota; quem não tem imóvel cai no 404 abaixo. */
export function generateStaticParams() {
  return REGIOES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const regiao = regiaoPorSlug(slug);
  if (!regiao) return { title: "Região não encontrada" };

  const catalogo = await getEmpreendimentos();
  const quantos = catalogo.filter(regiao.pertence).length;

  /*
   * O título leva a REGIÃO e o número, que é o que diferencia esta página das
   * outras na SERP. O sufixo da marca entra pelo template do layout raiz — a
   * régua de `seo.test.ts` já conta esses 12 caracteres.
   */
  return {
    title: `Imóveis em ${regiao.nome}`,
    description: `${quantos} ${quantos === 1 ? "empreendimento" : "empreendimentos"} em ${regiao.nome}. ${regiao.chamada}`,
    alternates: { canonical: `${site.url}/regioes/${regiao.slug}` },
  };
}

export default async function PaginaDaRegiao({ params }: Props) {
  const { slug } = await params;
  const regiao = regiaoPorSlug(slug);
  if (!regiao) notFound();

  const [catalogo, corretorAtivo] = await Promise.all([getEmpreendimentos(), getCorretorAtivo()]);
  const todasComEstoque = regioesComEstoque(catalogo);
  const comEstoque = todasComEstoque.find((r) => r.slug === slug);

  // Região declarada mas sem imóvel publicado NÃO vira página vazia: seria
  // uma URL indexável prometendo estoque que não existe.
  if (!comEstoque) notFound();

  const { imoveis, precoMinimo } = comEstoque;
  const bairros = [...new Set(imoveis.map((e) => e.bairro).filter(Boolean))].sort();
  const outras = todasComEstoque.filter((r) => r.slug !== slug);

  return (
    <main id="conteudo" className="flex flex-1 flex-col">
      <div className="bg-fundo relative pt-28 sm:pt-32">
        <section className="px-4 pb-12 sm:px-8 sm:pb-16">
          <div className="mx-auto w-full max-w-6xl">
            <Reveal>
              <nav aria-label="Você está aqui" className="text-fluid-xs text-apoio mb-4">
                <Link
                  href="/empreendimentos"
                  className="hover:text-titulo underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
                >
                  Imóveis
                </Link>
                <span aria-hidden className="text-tenue mx-2">
                  /
                </span>
                <span className="text-corpo">{regiao.nome}</span>
              </nav>

              <TituloEditorial className="text-fluid-3xl text-titulo">
                Imóveis em {regiao.nome}
              </TituloEditorial>
              <p className="text-fluid-base text-apoio mt-4 max-w-2xl text-pretty">
                {regiao.chamada}
              </p>
            </Reveal>

            {/* Os três números que decidem se vale rolar. Todos do catálogo. */}
            <Reveal delay={0.1}>
              <dl className="border-linha bg-linha/60 mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-3">
                {[
                  {
                    valor: String(imoveis.length),
                    rotulo: imoveis.length === 1 ? "empreendimento" : "empreendimentos",
                  },
                  {
                    valor: precoMinimo ? formatarMoedaBRL(precoMinimo) : "Sob consulta",
                    rotulo: "a partir de",
                  },
                  {
                    valor: String(bairros.length),
                    rotulo: bairros.length === 1 ? "bairro" : "bairros",
                  },
                ].map((n) => (
                  <div key={n.rotulo} className="bg-fundo px-5 py-6">
                    <dd className="font-display text-titulo text-2xl font-bold sm:text-3xl">
                      {n.valor}
                    </dd>
                    <dt className="text-fluid-xs text-apoio mt-1">{n.rotulo}</dt>
                  </div>
                ))}
              </dl>
            </Reveal>

            {bairros.length > 0 && (
              <Reveal delay={0.15}>
                <p className="text-fluid-sm text-apoio mt-5 text-pretty">
                  <span className="text-corpo">Bairros com imóvel aqui:</span> {bairros.join(" · ")}
                </p>
              </Reveal>
            )}
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-8 sm:pb-24">
          <div className="mx-auto w-full max-w-6xl">
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {imoveis.map((e, i) => (
                <Reveal key={e.slug} delay={(i % 3) * 0.08} from="baixo">
                  <li className="h-full">
                    <CardEmpreendimento empreendimento={e} prioridade={i < 3} />
                  </li>
                </Reveal>
              ))}
            </ul>

            <Reveal delay={0.1}>
              <Link
                href={regiao.filtro}
                className="text-fluid-base text-acento-suave mt-8 inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
              >
                Filtrar {regiao.nome} na busca completa
              </Link>
            </Reveal>
          </div>
        </section>

        {outras.length > 0 && (
          <section className="bg-superficie/40 px-4 py-16 sm:px-8 sm:py-24">
            <div className="mx-auto w-full max-w-6xl">
              <TituloEditorial className="text-fluid-2xl text-titulo">
                Outras regiões
              </TituloEditorial>
              <ul className="mt-6 flex flex-wrap gap-3">
                {outras.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/regioes/${r.slug}`}
                      className="border-linha bg-superficie/60 text-corpo hover:border-acento-linha hover:text-acento-suave inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors"
                    >
                      {r.nome}
                      <span className="text-tenue text-xs tabular-nums">{r.imoveis.length}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <CtaFinal />
      </div>

      <WhatsappCta corretor={corretorAtivo ?? undefined} />
    </main>
  );
}

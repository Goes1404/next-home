import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { getEmpreendimentos } from "@/lib/queries";
import { slugsParaComparar } from "@/lib/favoritos";
import { linhasDaComparacao } from "@/lib/comparacao";
import { FavoritosParaComparar } from "./FavoritosParaComparar";

export const metadata: Metadata = {
  title: "Comparar imóveis",
  description: "Compare lado a lado os imóveis que você salvou: preço, plantas, metragem, entrega e lazer.",
  robots: { index: false },
};

/**
 * Comparação lado a lado (26/09/2026). Os favoritos moram no aparelho do
 * visitante; a URL (`?imoveis=a,b,c`) é o que torna a comparação
 * compartilhável — mandar para o cônjuge é o uso mais provável.
 */
export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const slugs = slugsParaComparar(sp.imoveis);
  const catalogo = await getEmpreendimentos();
  const nomes = Object.fromEntries(catalogo.map((e) => [e.slug, e.nome]));
  const escolhidos = slugs
    .map((s) => catalogo.find((e) => e.slug === s))
    .filter((e): e is (typeof catalogo)[number] => Boolean(e));
  const linhas = linhasDaComparacao(escolhidos);

  return (
    <>
      <SiteHeader />
      <WhatsappCta />
      <main className="flex flex-1 flex-col px-4 pt-28 pb-24 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <VoltarLink href="/empreendimentos" variante="pilula">
            Voltar aos imóveis
          </VoltarLink>
          <h1 className="text-fluid-3xl mt-5 font-display tracking-tight text-titulo">Comparar imóveis</h1>
          <div className="mt-4">
            <FavoritosParaComparar selecionados={escolhidos.map((e) => e.slug)} nomes={nomes} />
          </div>

          {escolhidos.length > 0 && (
            <div className="mt-8 overflow-hidden rounded-3xl border border-linha-forte bg-superficie">
              <div
                className="grid border-b border-linha"
                style={{ gridTemplateColumns: `minmax(0,0.8fr) repeat(${escolhidos.length}, minmax(0,1fr))` }}
              >
                <div />
                {escolhidos.map((e) => (
                  <Link key={e.slug} href={`/empreendimentos/${e.slug}`} className="block p-2 sm:p-3">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                      <Image src={e.capa.url} alt={e.capa.alt} fill sizes="(min-width: 1024px) 25vw, 33vw" className="object-cover" />
                    </div>
                    <p className="text-fluid-sm mt-2 font-semibold break-words text-titulo">{e.nome}</p>
                  </Link>
                ))}
              </div>
              <dl>
                {linhas.map((l) => (
                  <div
                    key={l.rotulo}
                    className="grid border-b border-linha last:border-b-0"
                    style={{ gridTemplateColumns: `minmax(0,0.8fr) repeat(${escolhidos.length}, minmax(0,1fr))` }}
                  >
                    <dt className="text-fluid-xs p-2 font-semibold text-apoio sm:p-3">{l.rotulo}</dt>
                    {l.valores.map((v, i) => (
                      <dd key={i} className="text-fluid-xs p-2 break-words text-corpo sm:p-3">
                        {v}
                      </dd>
                    ))}
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

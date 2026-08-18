import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ViewTransition } from "react";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CtaFinal } from "@/components/home/CtaFinal";
import { Regioes } from "@/components/home/Regioes";
import { ScrollCue } from "@/components/home/ScrollCue";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { precoAPartirDe } from "@/lib/format";
import { getEmpreendimentos } from "@/lib/queries";

/**
 * Revalida em segundo plano a cada 5 min: sem isso, a página fica estática
 * desde o build e uma curadoria feita direto no banco (trocar destaque,
 * trocar capa etc.) só apareceria no próximo deploy de código.
 */
export const revalidate = 300;

/**
 * `noindex` de propósito: esta é a peça que o corretor compartilha no
 * WhatsApp, não uma porta de entrada de busca. A home institucional (`/`)
 * cobre a mesma intenção de quem procura a imobiliária no Google, e deixar as
 * duas indexadas só faria uma diluir a outra.
 */
export const metadata: Metadata = {
  title: "Portfólio Exclusivo de Imóveis em Alphaville | Next Home",
  description: "Lançamentos imobiliários de alto padrão, plantas sofisticadas e lazer completo em Alphaville, Barueri e região.",
  robots: { index: false, follow: true },
  openGraph: {
    title: "Portfólio de Imóveis de Alto Padrão em Alphaville | Next Home",
    description: "Confira a seleção exclusiva de lançamentos e oportunidades em Alphaville, Barueri e Santana de Parnaíba.",
    images: [
      {
        url: "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Next Home Negócios Imobiliários",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Portfólio de Imóveis de Alto Padrão em Alphaville | Next Home",
    description: "Confira a seleção exclusiva de lançamentos e oportunidades em Alphaville e região.",
    images: ["https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/og-image.jpg"],
  },
};

/**
 * Home imersiva (Fase 7): hero cinematográfico com fundo fixo (vivendo no
 * layout do grupo `(vitrine)`, compartilhado com a listagem) + seções de
 * scroll-telling reveladas via GSAP (`Reveal`). O fundo é `position: fixed`
 * lá no layout, o que casa com a suposição do shader de GlassSurface de que
 * o vidro refrata o viewport, não o documento — por isso nenhuma seção
 * abaixo pode envolver o header/CTA num ancestral com `transform`.
 */
export default async function Home() {
  const [todos, corretorAtivo] = await Promise.all([getEmpreendimentos(), getCorretorAtivo()]);
  const destaques = todos.filter((e) => e.destaque);

  return (
    // "Ver todos" (mais abaixo) navega para /empreendimentos marcado como
    // "nav-forward" — o par de animações em globals.css faz o conteúdo
    // desta página deslizar para fora enquanto o da listagem desliza para
    // dentro. O vídeo de fundo não participa: mora no layout do grupo, fora
    // desta árvore, e por isso não desmonta nem reinicia na troca.
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", default: "none" }}
      exit={{ "nav-forward": "nav-forward", default: "none" }}
      default="none"
    >
      <SiteHeader />
      <WhatsappCta corretor={corretorAtivo ?? undefined} />

      <main className="flex flex-1 flex-col">
        <section className="flex min-h-svh flex-col items-center justify-center px-4 pt-24 pb-32">
          <Reveal className="w-full max-w-xl">
            <GlassSurface preset="painel" className="px-7 py-9 text-center sm:px-10 sm:py-12">
              <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
                Alphaville · Barueri · Santana de Parnaíba
              </p>
              <h1 className="text-fluid-3xl text-mist-50">
                Experiências únicas em cada detalhe. O melhor de Alphaville para você.
              </h1>
              <p className="text-fluid-base mt-4 text-mist-200">
                Projetos de arquitetura sofisticada, lazer completo de resort e localizações privilegiadas para elevar seu padrão de vida.
              </p>
            </GlassSurface>
          </Reveal>

          <ScrollCue alvo="destaques" label="Role para ver mais" />
        </section>

        <section id="destaques" className="scroll-mt-20 px-4 pt-4 pb-28">
          <Reveal className="mx-auto max-w-lg text-center">
            <h2 className="text-fluid-2xl text-mist-50">Lançamentos Selecionados</h2>
            <p className="text-fluid-base mt-3 text-mist-300">
              Uma curadoria refinada dos projetos mais desejados da região.
            </p>
          </Reveal>

          <div className="mx-auto mt-10 grid w-full max-w-3xl gap-4 sm:grid-cols-2">
            {destaques.map((e, i) => (
              <Reveal key={e.slug} delay={i * 0.12} from="baixo">
                <Link href={`/empreendimentos/${e.slug}`}>
                  <GlassSurface preset="card" className="group overflow-hidden">
                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-[calc(var(--radius-glass)-1px)]">
                      <Image
                        src={e.capa.url}
                        alt={e.capa.alt}
                        fill
                        sizes="(min-width: 640px) 380px, 100vw"
                        className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      />
                    </div>
                    <div className="px-5 py-4">
                      <h3 className="font-display text-lg text-mist-50">{e.nome}</h3>
                      <p className="text-fluid-sm mt-0.5 text-mist-400">
                        {e.bairro}, {e.cidade}
                      </p>
                      <p className="text-fluid-sm mt-2 font-medium text-brand-200">
                        {precoAPartirDe(e.precoAPartir)}
                      </p>
                    </div>
                  </GlassSurface>
                </Link>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-10 text-center">
            <Link
              href="/empreendimentos"
              transitionTypes={["nav-forward"]}
              className="text-fluid-sm font-medium text-brand-200 underline-offset-4 hover:underline"
            >
              Ver todos os {todos.length} empreendimentos →
            </Link>
          </Reveal>
        </section>

        <Regioes />

        <CtaFinal />
      </main>
    </ViewTransition>
  );
}

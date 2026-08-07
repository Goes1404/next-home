import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { Contato } from "@/components/empreendimento/Contato";
import { Galeria } from "@/components/empreendimento/Galeria";
import { Hero } from "@/components/empreendimento/Hero";
import { Lazer } from "@/components/empreendimento/Lazer";
import { Localizacao } from "@/components/empreendimento/Localizacao";
import { Sobre } from "@/components/empreendimento/Sobre";
import { Tipologias } from "@/components/empreendimento/Tipologias";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { precoAPartirDe } from "@/lib/format";
import {
  getEmpreendimentoBySlug,
  getSlugsEmpreendimentos,
} from "@/lib/queries";

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const slugs = await getSlugsEmpreendimentos();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const e = await getEmpreendimentoBySlug(slug);
  if (!e) return {};

  const titulo = `${e.nome} — ${e.bairro}, ${e.cidade}`;
  const descricao = `${e.tagline} ${precoAPartirDe(e.precoAPartir)}.`;

  return {
    title: titulo,
    description: descricao,
    openGraph: {
      title: titulo,
      description: descricao,
      images: [{ url: e.capa.url, width: e.capa.largura, height: e.capa.altura }],
    },
  };
}

export default async function EmpreendimentoPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const e = await getEmpreendimentoBySlug(slug);
  if (!e) notFound();

  return (
    <GlassBackgroundProvider inicial={e.capa.url}>
      <SiteHeader />
      <WhatsappCta empreendimento={e.nome} corretor={e.corretor} />

      <main className="flex flex-1 flex-col">
        <Hero empreendimento={e} />

        <div className="relative bg-ink-950">
          <Sobre empreendimento={e} />
          <Tipologias tipologias={e.tipologias} />
          <Lazer itens={e.lazer} />
          <Galeria fotos={e.galeria} />
          <Localizacao empreendimento={e} />
          <Contato empreendimento={e} />
        </div>
      </main>
    </GlassBackgroundProvider>
  );
}

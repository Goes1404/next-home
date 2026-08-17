import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { iniciais } from "@/lib/format";
import { getCorretorPorSlug, getEmpreendimentosPorCorretor } from "@/lib/queries";
import { linkWhatsappPara, site } from "@/lib/site";

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const corretor = await getCorretorPorSlug(slug);
  if (!corretor) return {};

  return {
    title: corretor.nome,
    description: `${corretor.nome} — corretor da ${site.nomeCompleto}, CRECI ${corretor.creci}. Atuação em ${site.regioes.join(", ")}.`,
    alternates: { canonical: `/corretores/${corretor.slug}` },
  };
}

/**
 * Página do corretor — o "microsite de agente" que a RE/MAX usa, adaptado ao
 * porte da Next Home: quem é, o que ele acompanha hoje, e dois caminhos para
 * falar com ele.
 *
 * O botão "Ver portfólio completo" leva ao mesmo link pessoal que ele copia no
 * painel (`/portfolio?corretor=<slug>`): a partir dali, todo CTA do site passa
 * a apontar para o WhatsApp dele, mesmo em imóveis de outro responsável.
 */
export default async function CorretorPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const corretor = await getCorretorPorSlug(slug);
  if (!corretor) notFound();

  const empreendimentos = await getEmpreendimentosPorCorretor(corretor.id);
  const whatsapp = linkWhatsappPara(
    corretor.whatsapp,
    `Olá, ${corretor.nome}! Vim pelo site da Next Home e quero falar com você.`,
  );

  return (
    <main className="flex flex-1 flex-col px-4 pt-32 pb-24">
      <Reveal className="mx-auto w-full max-w-2xl">
        <GlassSurface preset="painel" className="px-7 py-8 text-center sm:px-10 sm:py-11">
          {corretor.fotoUrl ? (
            <Image
              src={corretor.fotoUrl}
              alt=""
              width={96}
              height={96}
              className="mx-auto h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="font-display mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand-600 text-2xl text-mist-50"
            >
              {iniciais(corretor.nome)}
            </span>
          )}

          <h1 className="text-fluid-2xl mt-5 text-mist-50">{corretor.nome}</h1>
          <p className="text-fluid-sm mt-1 text-mist-400">
            Corretor responsável · CRECI {corretor.creci}
          </p>

          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
            >
              Falar no WhatsApp
            </a>
            <Link
              href={`/portfolio?corretor=${corretor.slug}`}
              className="rounded-full border border-white/20 px-7 py-3.5 text-sm font-medium text-mist-100 transition-colors hover:border-brand-300/50 hover:text-brand-200"
            >
              Ver portfólio completo
            </Link>
          </div>
        </GlassSurface>
      </Reveal>

      {empreendimentos.length > 0 && (
        <section className="mx-auto mt-20 w-full max-w-5xl">
          <Reveal className="text-center">
            <h2 className="text-fluid-2xl text-mist-50">
              Acompanhados por {corretor.nome.split(" ")[0]}
            </h2>
            <p className="text-fluid-base mt-3 text-mist-300">
              {empreendimentos.length} empreendimento{empreendimentos.length === 1 ? "" : "s"} sob
              responsabilidade direta.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {empreendimentos.map((e, i) => (
              <Reveal key={e.slug} delay={i * 0.06} from="baixo">
                <CardEmpreendimento empreendimento={e} prioridade={i < 3} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <Reveal className="mt-16 text-center">
        <Link
          href="/corretores"
          className="text-fluid-sm text-mist-400 underline-offset-4 hover:text-mist-100 hover:underline"
        >
          ← Ver toda a equipe
        </Link>
      </Reveal>
    </main>
  );
}

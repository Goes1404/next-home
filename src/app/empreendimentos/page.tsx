import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FiltroForm } from "@/components/busca/FiltroForm";
import { FiltroSheet } from "@/components/busca/FiltroSheet";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { precoAPartirDe } from "@/lib/format";
import { site } from "@/lib/site";
import { getEmpreendimentos, getRegioesDisponiveis } from "@/lib/queries";
import { STATUS_LABEL, type FiltrosEmpreendimento, type TipoImovel } from "@/lib/types";

export const metadata: Metadata = {
  title: "Empreendimentos",
  description: `Lançamentos e oportunidades em ${site.regioes.join(", ")}.`,
};

type SearchParams = Record<string, string | string[] | undefined>;

const TIPOS_VALIDOS: TipoImovel[] = ["apartamento", "alto_padrao", "casa", "terreno"];

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseFiltros(sp: SearchParams): FiltrosEmpreendimento {
  const tipo = primeiro(sp.tipo);
  const precoMax = primeiro(sp.precoMax);
  const dormitoriosMin = primeiro(sp.dormitoriosMin);

  return {
    tipo: tipo && TIPOS_VALIDOS.includes(tipo as TipoImovel) ? (tipo as TipoImovel) : undefined,
    cidade: primeiro(sp.cidade) || undefined,
    bairro: primeiro(sp.bairro) || undefined,
    precoMax: precoMax ? Number(precoMax) : undefined,
    dormitoriosMin: dormitoriosMin ? Number(dormitoriosMin) : undefined,
  };
}

/**
 * Filtros vivem na URL (form GET nativo) — funciona sem JavaScript e o
 * resultado é sempre renderizado no servidor. Sem fundo fixo em WebGL aqui
 * de propósito: são muitos cards e nenhuma imagem única representa a
 * página inteira, então os cards usam borda sólida em vez do liquid glass.
 */
export default async function EmpreendimentosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filtros = parseFiltros(sp);

  const [empreendimentos, regioes] = await Promise.all([
    getEmpreendimentos(filtros),
    getRegioesDisponiveis(),
  ]);

  return (
    <GlassBackgroundProvider>
      <SiteHeader />
      <WhatsappCta />

      <main className="flex flex-1 flex-col bg-ink-950 px-4 pt-28 pb-20">
        {/*
          FiltroSheet abre um overlay `fixed inset-0`. Um `<Reveal>` aplica
          `transform` via GSAP no próprio elemento (mesmo já resolvido em
          0,0, o transform explícito fica) — qualquer transform num
          ancestral cria um novo containing block para `position: fixed`,
          então o sheet nunca pode ficar dentro de um Reveal.
        */}
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <Reveal>
              <h1 className="text-fluid-2xl text-mist-50">Empreendimentos</h1>
              <p className="text-fluid-base mt-2 text-mist-300">
                {empreendimentos.length} empreendimento{empreendimentos.length === 1 ? "" : "s"} em{" "}
                {site.regioes.join(", ")}.
              </p>
            </Reveal>
            <FiltroSheet temFiltroAtivo={Object.values(filtros).some((v) => v != null)}>
              <FiltroForm filtrosAtuais={filtros} regioes={regioes} idPrefixo="sheet" />
            </FiltroSheet>
          </div>

          <Reveal delay={0.1}>
            <FiltroForm
              filtrosAtuais={filtros}
              regioes={regioes}
              idPrefixo="desktop"
              className="mt-6 hidden rounded-2xl border border-white/10 bg-ink-900/60 p-5 sm:block"
            />
          </Reveal>
        </div>

        {empreendimentos.length === 0 ? (
          <Reveal className="mx-auto mt-16 w-full max-w-5xl text-center">
            <p className="text-fluid-lg text-mist-100">Nenhum empreendimento com esses filtros.</p>
            <Link
              href="/empreendimentos"
              className="text-fluid-sm mt-2 inline-block text-brand-200 underline-offset-4 hover:underline"
            >
              Limpar filtros
            </Link>
          </Reveal>
        ) : (
          <div className="mx-auto mt-10 grid w-full max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {empreendimentos.map((e, i) => (
              <Reveal key={e.slug} delay={i * 0.06} from="baixo">
                <Link
                  href={`/empreendimentos/${e.slug}`}
                  className="group block overflow-hidden rounded-2xl border border-white/10 bg-ink-900 transition-colors hover:border-white/20"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
                    <Image
                      src={e.capa.url}
                      alt={e.capa.alt}
                      fill
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                    <span className="text-fluid-xs absolute top-3 left-3 rounded-full bg-ink-950/80 px-3 py-1 font-medium tracking-wide text-brand-200 uppercase">
                      {STATUS_LABEL[e.status]}
                    </span>
                  </div>
                  <div className="px-5 py-4">
                    <h2 className="font-display text-lg text-mist-50">{e.nome}</h2>
                    <p className="text-fluid-sm mt-0.5 text-mist-400">
                      {e.bairro}, {e.cidade}
                    </p>
                    <p className="text-fluid-sm mt-2 font-medium text-brand-200">
                      {precoAPartirDe(e.precoAPartir)}
                    </p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        )}
      </main>
    </GlassBackgroundProvider>
  );
}

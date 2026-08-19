import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { FiltroForm } from "@/components/busca/FiltroForm";
import { FiltroSheet } from "@/components/busca/FiltroSheet";
import { FiltrosAtivos } from "@/components/busca/FiltrosAtivos";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { site } from "@/lib/site";
import { getEmpreendimentos, getRegioesDisponiveis } from "@/lib/queries";
import { Map } from "lucide-react";
import {
  ORDENACAO_LABEL,
  type FiltrosEmpreendimento,
  type Ordenacao,
  type TipoImovel,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Empreendimentos e Lançamentos em Alphaville e Barueri | Melhores Ofertas",
  description: `Confira as melhores oportunidades em apartamentos na planta, prontos para morar e casas em condomínio em ${site.regioes.join(", ")}. Condições facilitadas e atendimento rápido.`,
  alternates: { canonical: "/empreendimentos" },
  openGraph: {
    title: "Empreendimentos e Oportunidades em Alphaville e Região | Next Home",
    description: `Catálogo completo de lançamentos e oportunidades selecionadas em Alphaville e região.`,
    url: `${site.url}/empreendimentos`,
  },
};

type SearchParams = Record<string, string | string[] | undefined>;

const TIPOS_VALIDOS: TipoImovel[] = ["apartamento", "alto_padrao", "casa", "terreno"];
const ORDENACOES_VALIDAS = Object.keys(ORDENACAO_LABEL) as Ordenacao[];

function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Número vindo da URL só vale se for finito e não-negativo. */
function numero(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseFiltros(sp: SearchParams): FiltrosEmpreendimento {
  const tipo = primeiro(sp.tipo);

  return {
    tipo: tipo && TIPOS_VALIDOS.includes(tipo as TipoImovel) ? (tipo as TipoImovel) : undefined,
    cidade: primeiro(sp.cidade) || undefined,
    bairro: primeiro(sp.bairro) || undefined,
    precoMax: numero(primeiro(sp.precoMax)),
    dormitoriosMin: numero(primeiro(sp.dormitoriosMin)),
  };
}

function parseOrdenacao(sp: SearchParams): Ordenacao {
  const valor = primeiro(sp.ordenar);
  return valor && ORDENACOES_VALIDAS.includes(valor as Ordenacao)
    ? (valor as Ordenacao)
    : "destaque";
}

export default async function EmpreendimentosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const filtros = parseFiltros(sp);
  const ordenacao = parseOrdenacao(sp);

  const [empreendimentos, regioes] = await Promise.all([
    getEmpreendimentos(filtros, ordenacao),
    getRegioesDisponiveis(),
  ]);

  const temFiltroAtivo = Object.values(filtros).some((v) => v != null);

  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", default: "none" }}
      exit={{ "nav-forward": "nav-forward", default: "none" }}
      default="none"
    >
      <SiteHeader />
      <WhatsappCta />

      <main className="flex flex-1 flex-col px-4 pt-28 pb-20">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <Reveal>
              <h1 className="text-fluid-2xl text-titulo">Empreendimentos & Oportunidades</h1>
              <p className="text-fluid-base mt-2 text-apoio">
                {empreendimentos.length} empreendimento{empreendimentos.length === 1 ? "" : "s"} disponível{empreendimentos.length === 1 ? "" : "is"} em{" "}
                {site.regioes.join(", ")}.
              </p>
            </Reveal>
            <div className="flex items-center gap-2">
              <Link
                href="/mapa"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-corpo text-fluid-xs font-semibold backdrop-blur border border-white/15 transition-all shadow-md"
              >
                <span> <Map className="inline-block w-5 h-5 align-text-bottom mr-1" />  Ver no Mapa</span>
              </Link>

              <FiltroSheet temFiltroAtivo={temFiltroAtivo}>
                <FiltroForm
                  filtrosAtuais={filtros}
                  ordenacaoAtual={ordenacao}
                  regioes={regioes}
                  idPrefixo="sheet"
                />
              </FiltroSheet>
            </div>
          </div>

          <FiltrosAtivos filtros={filtros} ordenacao={ordenacao} />

          <Reveal delay={0.1}>
            <FiltroForm
              filtrosAtuais={filtros}
              ordenacaoAtual={ordenacao}
              regioes={regioes}
              idPrefixo="desktop"
              className="mt-6 hidden rounded-2xl border border-linha/10 bg-superficie/60 p-5 sm:block"
            />
          </Reveal>
        </div>

        {empreendimentos.length === 0 ? (
          <Reveal className="mx-auto mt-16 w-full max-w-5xl text-center">
            <p className="text-fluid-lg text-corpo">Nenhum empreendimento encontrado com esses filtros.</p>
            <Link
              href="/empreendimentos"
              className="text-fluid-sm mt-2 inline-block text-acento underline-offset-4 hover:underline"
            >
              Ver todas as opções disponíveis
            </Link>
          </Reveal>
        ) : (
          <div className="mx-auto mt-10 grid w-full max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {empreendimentos.map((e, i) => (
              <Reveal key={e.slug} delay={i * 0.06} from="baixo">
                <CardEmpreendimento empreendimento={e} prioridade={i < 3} />
              </Reveal>
            ))}
          </div>
        )}
      </main>
    </ViewTransition>
  );
}

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
import {
  ORDENACAO_LABEL,
  type FiltrosEmpreendimento,
  type Ordenacao,
  type TipoImovel,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Empreendimentos",
  description: `Lançamentos e oportunidades em ${site.regioes.join(", ")}.`,
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

/**
 * Filtros vivem na URL (form GET nativo) — funciona sem JavaScript e o
 * resultado é sempre renderizado no servidor. O fundo fixo (vídeo do hero)
 * vem do layout do grupo `(vitrine)`, compartilhado com a home — os cards
 * continuam com borda sólida em vez do liquid glass, já que são muitos e
 * nenhuma imagem única representa a página inteira.
 */
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
    // Chegando da home via "Ver todos" (marcado "nav-forward"), o conteúdo
    // desliza para dentro enquanto o vídeo de fundo — fora desta árvore, no
    // layout do grupo — segue tocando sem interrupção. Ver o comentário
    // equivalente na home (app/(vitrine)/page.tsx).
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", default: "none" }}
      exit={{ "nav-forward": "nav-forward", default: "none" }}
      default="none"
    >
      <SiteHeader />
      <WhatsappCta />

      <main className="flex flex-1 flex-col px-4 pt-28 pb-20">
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
            <FiltroSheet temFiltroAtivo={temFiltroAtivo}>
              <FiltroForm
                filtrosAtuais={filtros}
                ordenacaoAtual={ordenacao}
                regioes={regioes}
                idPrefixo="sheet"
              />
            </FiltroSheet>
          </div>

          <FiltrosAtivos filtros={filtros} ordenacao={ordenacao} />

          <Reveal delay={0.1}>
            <FiltroForm
              filtrosAtuais={filtros}
              ordenacaoAtual={ordenacao}
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
                <CardEmpreendimento empreendimento={e} prioridade={i < 3} />
              </Reveal>
            ))}
          </div>
        )}
      </main>
    </ViewTransition>
  );
}

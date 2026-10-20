import type { Metadata } from "next";
import Link from "next/link";
import { ViewTransition } from "react";
import { FiltroForm } from "@/components/busca/FiltroForm";
import { FiltroSheet } from "@/components/busca/FiltroSheet";
import { FiltrosAtivos } from "@/components/busca/FiltrosAtivos";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { CtaFinal } from "@/components/home/CtaFinal";
import { AvisemeQuandoSurgir } from "@/components/busca/AvisemeQuandoSurgir";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { ehEstagio } from "@/lib/estagioDeCompra";
import { siteDaPagina, type ParamsDoSite } from "@/lib/sites/pagina";
import { openGraphDaPagina } from "@/lib/sites/metadados";
import { getEmpreendimentosDoLink, getRegioesDisponiveis } from "@/lib/queries";
import { Map } from "lucide-react";
import {
  ORDENACAO_LABEL,
  type FiltrosEmpreendimento,
  type Ordenacao,
  type TipoImovel,
} from "@/lib/types";

const METADADOS = {
  title: "Lançamentos e Imóveis em Alphaville e Barueri",
  description:
    "Apartamentos na planta, prontos para morar e casas em condomínio em Alphaville, Barueri e região. Fotos, plantas e condições de pagamento.",
  alternates: { canonical: "/empreendimentos" },
} satisfies Metadata;

export async function generateMetadata({ params }: { params: Promise<ParamsDoSite> }): Promise<Metadata> {
  const { marca } = await siteDaPagina(params);
  return {
    ...METADADOS,
    openGraph: openGraphDaPagina(marca, {
      titulo: `Empreendimentos e Oportunidades em Alphaville e Região | ${marca.nome}`,
      descricao: "Catálogo completo de lançamentos e oportunidades selecionadas em Alphaville e região.",
      caminho: "/empreendimentos",
    }),
  };
}

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
  const estagio = primeiro(sp.estagio);

  return {
    // Teto de 80 chars: é campo de nome, não de redação — e a URL vai para
    // o histórico e para links compartilhados.
    busca: primeiro(sp.busca)?.trim().slice(0, 80) || undefined,
    tipo: tipo && TIPOS_VALIDOS.includes(tipo as TipoImovel) ? (tipo as TipoImovel) : undefined,
    cidade: primeiro(sp.cidade) || undefined,
    bairro: primeiro(sp.bairro) || undefined,
    precoMax: numero(primeiro(sp.precoMax)),
    dormitoriosMin: numero(primeiro(sp.dormitoriosMin)),
    // As duas portas da home entram por aqui. Valor fora do vocabulário é
    // ignorado, não erra: link velho compartilhado devolve a lista inteira.
    estagio: ehEstagio(estagio) ? estagio : undefined,
  };
}

function parseOrdenacao(sp: SearchParams): Ordenacao {
  const valor = primeiro(sp.ordenar);
  return valor && ORDENACOES_VALIDAS.includes(valor as Ordenacao)
    ? (valor as Ordenacao)
    : "destaque";
}

export default async function EmpreendimentosPage({
  params,
  searchParams,
}: {
  params: Promise<ParamsDoSite>;
  searchParams: Promise<SearchParams>;
}) {
  const { grupoId, marca } = await siteDaPagina(params);
  const sp = await searchParams;
  const filtros = parseFiltros(sp);
  const ordenacao = parseOrdenacao(sp);

  const [empreendimentos, regioes] = await Promise.all([
    getEmpreendimentosDoLink(grupoId, filtros, ordenacao),
    getRegioesDisponiveis(grupoId),
  ]);

  const temFiltroAtivo = Object.values(filtros).some((v) => v != null);

  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", default: "none" }}
      exit={{ "nav-forward": "nav-forward", default: "none" }}
      default="none"
    >
      <SiteHeader marca={marca} />
      <WhatsappCta />

      <main className="flex flex-1 flex-col px-4 pt-28 pb-20 sm:px-8">
        <div className="mx-auto w-full max-w-6xl">
          {/* Toda página pública tem um botão de voltar (12/09/2026). Aqui
              o header da vitrine não tem "Início" — só a logo, que ninguém
              lê como botão. */}
          <Reveal from="nenhuma" className="mb-5">
            <VoltarLink href="/" variante="pilula">
              Voltar ao site
            </VoltarLink>
          </Reveal>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <TituloEditorial as="h1" className="text-fluid-3xl tracking-tight text-titulo">
                Empreendimentos & Oportunidades
              </TituloEditorial>
              <Reveal from="nenhuma" delay={0.25}><p className="text-fluid-base mt-2 text-apoio">
                {empreendimentos.length} empreendimento{empreendimentos.length === 1 ? "" : "s"} disponível{empreendimentos.length === 1 ? "" : "is"}
                {marca.regioes.length > 0 ? ` em ${marca.regioes.join(", ")}` : ""}.
              </p></Reveal>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/mapa"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-vidro-forte hover:bg-vidro-mais text-corpo text-fluid-xs font-semibold md:backdrop-blur border border-linha-forte transition-all shadow-md"
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
          <Reveal className="mx-auto mt-16 w-full max-w-6xl text-center">
            <p className="text-fluid-lg text-corpo">Nenhum empreendimento encontrado com esses filtros.</p>
            <Link
              href="/empreendimentos"
              className="text-fluid-sm mt-2 inline-block text-acento-suave underline-offset-4 hover:underline"
            >
              Ver todas as opções disponíveis
            </Link>
          </Reveal>
        ) : (
          <div className="mx-auto mt-10 grid w-full max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {empreendimentos.map((e, i) => {
              // O primeiro resultado sem filtro é a vitrine da vitrine:
              // ocupa duas colunas com capa panorâmica.
              const destaqueGrande = i === 0 && !temFiltroAtivo && empreendimentos.length > 3;
              // A mesma passagem dos cards da home (`cartao-passa`, 13/10/2026):
              // cada card sobe e acende ao entrar e encolhe ao sair, pela
              // própria posição na tela. Substitui o Reveal: os dois juntos
              // seriam dois donos da opacidade. `--coluna` é a coluna REAL no
              // computador, contando as duas que o destaque grande ocupa.
              const temGrande = !temFiltroAtivo && empreendimentos.length > 3;
              const coluna = (i + (temGrande && i > 0 ? 1 : 0)) % 3;
              return (
                <div
                  key={e.slug}
                  className={`cartao-passa h-full${destaqueGrande ? " sm:col-span-2" : ""}`}
                  style={{ "--coluna": coluna } as React.CSSProperties}
                >
                  <CardEmpreendimento
                    empreendimento={e}
                    nivel="h2"
                    prioridade={i < 3}
                    velocidadeCapa={0.08 + (i % 3) * 0.05}
                    aspecto={destaqueGrande ? "aspect-[4/3] sm:aspect-[21/10]" : undefined}
                    sizes={
                      destaqueGrande
                        ? "(min-width: 1024px) 66vw, 100vw"
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        <AvisemeQuandoSurgir
          regiao={filtros.bairro ?? filtros.cidade}
          dormitoriosMin={filtros.dormitoriosMin}
          precoMax={filtros.precoMax}
          poucosResultados={empreendimentos.length < 3}
        />

        {/* CTA para o corretor no fim da lista: quem rolou 25 cartões e não
            clicou em nenhum precisa de uma saída que não seja o topo. */}
        <div className="mt-16 sm:mt-24">
          <CtaFinal />
        </div>
      </main>
    </ViewTransition>
  );
}

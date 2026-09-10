import type { Metadata } from "next";
import Link from "next/link";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { CardCorretor } from "@/components/corretores/CardCorretor";
import { CtaFinal } from "@/components/home/CtaFinal";
import { Regioes } from "@/components/home/Regioes";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { FaixaDeProva } from "@/components/institucional/FaixaDeProva";
import { MapaDaSede } from "@/components/institucional/MapaDaSede";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { CartaoTilt } from "@/components/motion/CartaoTilt";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getCorretores, getEmpreendimentos, getRegioesDisponiveis } from "@/lib/queries";
import { enderecoLinha, linkWhatsapp, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sobre a Next Home",
  description: `Imobiliária de Alphaville com CRECI ${site.creci}: lançamentos e imóveis prontos em Alphaville, Barueri e região, com atendimento direto no WhatsApp.`,
  alternates: { canonical: "/sobre" },
  openGraph: {
    title: `Sobre a ${site.nomeCompleto}`,
    description: site.descricao,
    url: `${site.url}/sobre`,
  },
};

/**
 * A página Sobre — refeita em 10/09/2026 só com o que dá para conferir.
 *
 * ## O que saiu, e por quê
 *
 * A versão anterior tinha uma "linha do tempo" com seis empreendimentos
 * entregues desde 2016 que NÃO EXISTEM no catálogo nem no mundo (fotos do
 * Unsplash, links para `/mapa?imovel=` de slugs inventados), um simulador
 * prometendo "11,5% ao ano de valorização" — exatamente a promessa de
 * rentabilidade que o validador de copy desta casa proíbe nas peças de
 * marketing — e um vídeo institucional de banco de imagens. Numa página cujo
 * único trabalho é dar confiança, conteúdo inventado é o pior conteúdo
 * possível: quem conferir uma coisa e não achar, desconfia de todas.
 *
 * ## O que entrou
 *
 * Tudo abaixo sai do banco ou de `lib/site.ts` na mesma requisição: quantos
 * imóveis, em quantos bairros e cidades, quantos corretores com CRECI, as
 * regiões que TÊM estoque, a equipe, e o endereço com mapa. E quatro fatos
 * sobre COMO o atendimento acontece — cada um descreve um mecanismo que
 * existe no produto (WhatsApp sem formulário, agenda real de visitas, o
 * simulador com a mesma conta do painel, ficha completa por imóvel).
 */
const COMO_FUNCIONA = [
  {
    titulo: "Sem formulário",
    texto:
      "Todo botão de contato abre o WhatsApp. Você escreve, a conversa começa ali — sem cadastro, sem fila, sem ligação de retorno.",
  },
  {
    titulo: "Visita em horário que existe",
    texto:
      "O horário oferecido sai da agenda real do corretor. Ninguém marca uma visita que depois precisa ser desmarcada.",
    href: "/corretores",
    chamada: "Conhecer a equipe",
  },
  {
    titulo: "A conta é a mesma",
    texto:
      "O simulador de financiamento do site usa o mesmo cálculo que o corretor usa no painel. O número que você vê aqui é o que ouve depois.",
    href: "/financiamento",
    chamada: "Simular agora",
  },
  {
    titulo: "Ficha completa, sem enfeite",
    texto:
      "Fotos, plantas, lazer, entrega e mapa de cada imóvel. O que não está cadastrado, a gente diz que não está — em vez de inventar.",
    href: "/empreendimentos",
    chamada: "Ver os imóveis",
  },
];

export default async function SobrePage() {
  const [catalogo, regioes, corretores, corretorAtivo] = await Promise.all([
    getEmpreendimentos(),
    getRegioesDisponiveis(),
    getCorretores(),
    getCorretorAtivo(),
  ]);

  const equipe = corretores.slice(0, 6);

  return (
    <>
      <Pagina>
        <Secao espaco="abertura">
          <CabecalhoDePagina
            atual="Sobre"
            rotulo={
              <>
                CRECI <span className="text-corpo font-medium tabular-nums">{site.creci}</span> ·{" "}
                {site.endereco.bairro}, {site.endereco.cidade}
              </>
            }
            titulo="Quem está do outro lado do WhatsApp"
            lead={
              <>
                A {site.nomeCompleto} é uma imobiliária de Alphaville, com registro no CRECI,
                especializada em lançamentos e imóveis prontos em Alphaville, Barueri e região.
                O atendimento acontece no WhatsApp, com corretores registrados — e esta página
                mostra o que dá para conferir.
              </>
            }
          />
        </Secao>

        <Secao espaco="final">
          <FaixaDeProva
            numeros={[
              {
                valor: catalogo.length,
                rotulo: catalogo.length === 1 ? "imóvel no catálogo" : "imóveis no catálogo",
              },
              { valor: regioes.bairros.length, rotulo: "bairros atendidos" },
              {
                valor: regioes.cidades.length,
                rotulo: regioes.cidades.length === 1 ? "cidade" : "cidades",
              },
              { valor: corretores.length, rotulo: "com CRECI ativo" },
            ]}
          />
        </Secao>

        <Secao banda>
          <p className="text-fluid-xs text-apoio mb-3">Quatro coisas que valem em toda conversa</p>
          <TituloEditorial className="text-fluid-2xl text-titulo">
            Como a gente trabalha
          </TituloEditorial>

          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {COMO_FUNCIONA.map((item, i) => (
              <Reveal
                key={item.titulo}
                as="li"
                delay={(i % 2) * 0.1}
                from="baixo"
                className="border-linha bg-superficie/50 flex h-full flex-col rounded-2xl border p-5 sm:p-6"
              >
                <h3 className="font-display text-titulo text-lg">{item.titulo}</h3>
                <p className="text-fluid-sm text-apoio mt-2 text-pretty">{item.texto}</p>
                {item.href && (
                  <Link
                    href={item.href}
                    className="text-fluid-sm text-acento-suave mt-auto inline-flex min-h-11 items-center gap-1 pt-3 font-medium underline-offset-4 hover:underline"
                  >
                    {item.chamada}
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </Reveal>
            ))}
          </ul>
        </Secao>

        {/* Regioes traz a própria seção e o próprio fundo; o respiro de cima
            vem daqui para casar com o ritmo das vizinhas. */}
        <div className="pt-16 sm:pt-24">
          <Regioes catalogo={catalogo} />
        </div>

        {equipe.length > 0 && (
          <Secao banda>
            <p className="text-fluid-xs text-apoio mb-3">
              <span className="text-acento-suave font-semibold tabular-nums">{corretores.length}</span>{" "}
              {corretores.length === 1 ? "corretor" : "corretores"} com CRECI, na região
            </p>
            <TituloEditorial className="text-fluid-2xl text-titulo">
              A equipe, pelo nome
            </TituloEditorial>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* CartaoTilt no lugar do Reveal: o tilt já faz a própria entrada
                  e assume a opacidade — somar os dois é ter dois donos dela. */}
              {equipe.map((c, i) => (
                <CartaoTilt key={c.slug} indice={i} className="rounded-glass">
                  <CardCorretor corretor={c} compacto />
                </CartaoTilt>
              ))}
            </div>

            <Reveal className="mt-8">
              <Link
                href="/corretores"
                className="text-fluid-sm text-acento-suave inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
              >
                {corretores.length > equipe.length
                  ? `Ver toda a equipe (${corretores.length}) →`
                  : "Ver perfis e falar direto →"}
              </Link>
            </Reveal>
          </Secao>
        )}

        <Secao>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start lg:gap-12">
            <div>
              <p className="text-fluid-xs text-apoio mb-3">Escritório</p>
              <TituloEditorial className="text-fluid-2xl text-titulo">
                Onde a gente está
              </TituloEditorial>

              <Reveal from="nenhuma" delay={0.2}>
                <address className="text-fluid-base text-apoio mt-5 space-y-1 not-italic">
                  <p className="text-corpo">{site.endereco.logradouro}</p>
                  <p>
                    {site.endereco.bairro}, {site.endereco.cidade}/{site.endereco.uf}
                  </p>
                  <p className="text-fluid-sm text-tenue">CEP {site.endereco.cep}</p>
                </address>

                <ul className="mt-6 flex flex-wrap gap-3">
                  {site.whatsapp.map((w, i) => (
                    <li key={w.numero}>
                      <WhatsappLink
                        href={linkWhatsapp(undefined, i)}
                        origem="sobre"
                        className="border-linha bg-superficie/60 text-corpo hover:border-acento-linha hover:text-acento-suave inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors"
                      >
                        <span aria-hidden className="bg-ok size-2 rounded-full" />
                        {w.label}
                      </WhatsappLink>
                    </li>
                  ))}
                </ul>

                <p className="text-fluid-xs text-tenue mt-6">
                  {site.nomeCompleto} · CRECI {site.creci}
                </p>
                <p className="sr-only">{enderecoLinha}</p>
              </Reveal>
            </div>

            <Reveal delay={0.1} from="baixo">
              <MapaDaSede />
            </Reveal>
          </div>
        </Secao>

        <CtaFinal />
      </Pagina>

      <WhatsappCta corretor={corretorAtivo ?? undefined} />
    </>
  );
}

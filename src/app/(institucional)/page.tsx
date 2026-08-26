import type { Metadata } from "next";
import Link from "next/link";
import { FiltroForm } from "@/components/busca/FiltroForm";
import { CardCorretor } from "@/components/corretores/CardCorretor";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CtaFinal } from "@/components/home/CtaFinal";
import { Regioes } from "@/components/home/Regioes";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { AberturaHome } from "@/components/motion/AberturaHome";
import { Camada } from "@/components/motion/Camada";
import { ParallaxFundoHome } from "@/components/motion/ParallaxFundoHome";
import { CartaoTilt } from "@/components/motion/CartaoTilt";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getCorretores, getEmpreendimentos, getRegioesDisponiveis } from "@/lib/queries";
import { GloboOuMapa } from "@/components/mapa/GloboOuMapa";
import { enderecoLinha, site } from "@/lib/site";

export const metadata: Metadata = {
  title: `${site.nomeCompleto} — Imóveis e Oportunidades em Alphaville, Barueri e Região`,
  description: site.descricao,
  alternates: { canonical: "/" },
  openGraph: {
    title: `${site.nomeCompleto} — Imóveis e Oportunidades em Alphaville, Barueri e Região`,
    description: site.descricao,
    url: site.url,
  },
};

/**
 * Dos três "caminhos" antigos sobrou só o do vendedor. Os outros dois eram
 * ruído medido: "Quero Comprar" apontava para o MESMO destino da busca logo
 * acima (a home tinha seis controles diferentes caindo em /empreendimentos
 * sem filtro), e "Atendimento Personalizado" prometia WhatsApp mas abria uma
 * página-índice. Este fica porque /anunciar-imovel não tem nenhuma outra
 * porta na home.
 */
const VENDEDOR = {
  href: "/anunciar-imovel",
  titulo: "Tem um imóvel para vender?",
  texto:
    "Venda mais rápido com quem tem compradores ativos, divulgação estratégica e assessoria completa do início ao fim.",
  cta: "Anunciar com Quem Vende",
};

/**
 * Home institucional — a porta de entrada de quem chega pelo Google.
 *
 * Diferente do portfólio (`/portfolio`), que é a peça que o corretor manda
 * pronta ao cliente, esta página responde "quem é a Next Home e o que ela faz
 * por mim". Quem chega por link de corretor nem passa por aqui: o `proxy.ts`
 * detecta o `?corretor=` na raiz e manda direto ao catálogo.
 */
export default async function HomeInstitucional() {
  const [todos, regioes, corretores, corretorAtivo] = await Promise.all([
    getEmpreendimentos(),
    getRegioesDisponiveis(),
    getCorretores(),
    getCorretorAtivo(),
  ]);

  let destaques = todos.filter((e) => e.destaque).slice(0, 3);
  if (destaques.length < 3) {
    const slugsDestaque = new Set(destaques.map((e) => e.slug));
    const restantes = todos.filter((e) => !slugsDestaque.has(e.slug));
    destaques = [...destaques, ...restantes.slice(0, 3 - destaques.length)];
  }
  const equipe = corretores.slice(0, 4);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: site.nomeCompleto,
    description: site.descricao,
    url: site.url,
    telephone: site.whatsapp.map((w) => `+${w.numero}`),
    address: {
      "@type": "PostalAddress",
      streetAddress: `${site.endereco.logradouro} — ${site.endereco.bairro}`,
      addressLocality: site.endereco.cidade,
      addressRegion: site.endereco.uf,
      postalCode: site.endereco.cep,
      addressCountry: "BR",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: site.endereco.lat,
      longitude: site.endereco.lng,
    },
    areaServed: site.regioes.map((r) => ({ "@type": "Place", name: r })),
    sameAs: Object.values(site.social),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Montado no servidor a partir de `lib/site.ts`, não de entrada de usuário.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <AberturaHome />

      <main id="conteudo" className="flex flex-1 flex-col">
        {/* Tela cheia nas DUAS larguras desde 26/08/2026. A restrição antiga
            ("altura de tela só a partir de sm") existia porque no telefone o
            conjunto título + texto + busca não cabia na viewport e
            transbordava por cima do CTA flutuante do WhatsApp. Com o texto
            do hero fora da tela no celular sobra só a busca, que cabe com
            folga — e a vinheta da marca ganha a tela inteira, que é o ponto
            de ela estar ali.

            No celular a busca desce para o terço inferior (`justify-end`):
            centralizada, ela cobria justamente o símbolo, que também é
            centrado no quadro. Assim a metade de cima fica só para a marca.
            O `pb-32` não é folga estética — é o que mantém a busca acima do
            CTA flutuante do WhatsApp, que é `fixed` no canto inferior. Do
            `sm` para cima volta ao centro, porque lá quem manda na
            composição é o texto do hero. */}
        <section className="relative flex min-h-svh flex-col items-center justify-end px-4 pt-24 pb-32 sm:justify-center sm:pt-28 sm:pb-20">
          {/* O medidor do parallax do fundo. Precisa de um ancestral que
              ROLE (esta seção, agora `relative`) — o fundo é `fixed` e não
              serve de referência de scroll. */}
          <ParallaxFundoHome />
          {/* `data-abertura`: quem a AberturaHome conduz quando a vinheta
              sai de cena. Estes itens NÃO usam Reveal — dois donos da mesma
              opacidade é o caminho curto para o elemento sumir. A classe
              `gsap-pending` mantém o contrato de sempre: nascem invisíveis e
              voltam sozinhos se o JS falhar (`.no-js`/`.motion-off`). */}
          {/* Camada POR FORA dos `data-abertura`: a AberturaHome é dona da
              opacidade deles, a camada só escreve transform, e os dois nunca
              dividem o mesmo nó. Título a -0.22 e busca a -0.10 — o título
              escapa da tela antes, e é essa diferença que se lê como planos
              separados em vez de um bloco só subindo. */}
          <Camada velocidade={-0.22} className="w-full max-w-4xl text-center">
            <p
              data-abertura
              className="gsap-pending so-para-leitor text-fluid-xs sm:mb-4 font-medium tracking-[0.2em] text-acento-suave uppercase"
            >
              Imóveis & Oportunidades · Alphaville, Barueri e Região
            </p>
            {/* O h1 é um FATO do estoque, curto de propósito: o anterior tinha
                77 caracteres — seis linhas de display num celular — e não dizia
                nada verificável. A promessa longa desceu para o subtítulo. */}
            <h1
              data-abertura
              className="gsap-pending so-para-leitor text-fluid-4xl leading-[1.05] tracking-tight text-titulo"
            >
              {todos.length} imóveis em Alphaville, Barueri e região.
            </h1>
            <p
              data-abertura
              className="gsap-pending so-para-leitor text-fluid-base mx-auto sm:mt-6 max-w-xl text-corpo-suave"
            >
              Lançamentos na planta e prontos para morar, com condições
              facilitadas e atendimento direto no WhatsApp.
            </p>
          </Camada>

          <Camada velocidade={-0.1} className="mt-8 w-full max-w-3xl sm:mt-10">
            <div data-abertura className="gsap-pending">
              <GlassSurface preset="painel" className="px-5 py-5 sm:px-7 sm:py-7">
                <FiltroForm
                  compacto
                  filtrosAtuais={{}}
                  ordenacaoAtual="destaque"
                  regioes={regioes}
                  idPrefixo="hero"
                />
              </GlassSurface>
            </div>
          </Camada>
        </section>

        {/* Do primeiro conteúdo em diante o fundo é OPACO, como na página do
            imóvel: é o que permite bandas de seção — sem fundo próprio não
            existe separação, tudo flutuava translúcido sobre o vídeo. */}
        <div className="relative bg-fundo pt-16 sm:pt-24">
          {/* PRODUTO PRIMEIRO. Antes, o primeiro imóvel aparecia a 2,9 telas
              de rolagem, atrás de três cards institucionais. Numa imobiliária
              o produto é a foto do imóvel — ela abre o conteúdo. */}
          {destaques.length > 0 && (
            <section className="px-4 pb-24 sm:px-8 sm:pb-28">
              <div className="mx-auto w-full max-w-5xl">
                <p className="text-fluid-xs mb-3 tracking-[0.22em] text-acento-suave uppercase">
                  Selecionados
                </p>
                <TituloEditorial className="text-fluid-3xl text-titulo">
                  Oportunidades em destaque
                </TituloEditorial>

                <div className="mt-10 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {destaques.map((e, i) => (
                    <Reveal key={e.slug} delay={(i % 3) * 0.1} from="baixo">
                      <CardEmpreendimento
                        empreendimento={e}
                        velocidadeCapa={0.08 + (i % 3) * 0.05}
                      />
                    </Reveal>
                  ))}
                </div>

                <Reveal className="mt-10">
                  <Link
                    href="/empreendimentos"
                    className="text-fluid-base font-medium text-acento-suave underline-offset-4 hover:underline"
                  >
                    Ver todos os {todos.length} imóveis →
                  </Link>
                </Reveal>
              </div>
            </section>
          )}

          {/* Regioes é compartilhado com o portfólio do corretor — a banda vem
              do embrulho, não de dentro do componente. */}
          <div className="bg-superficie/40">
            <Regioes />
          </div>

          {/* Mapa geral: todos os imóveis com pin de localização; o clique
              abre o card com as características básicas e o botão de ver o
              imóvel (CardFlutuanteImovel, o mesmo da página /mapa). */}
          {todos.length > 0 && (
          <section className="px-4 py-16 sm:px-8 sm:py-24">
            <div className="mx-auto w-full max-w-6xl">
              <p className="text-fluid-xs mb-3 tracking-[0.22em] text-acento-suave uppercase">
                A região
              </p>
              <TituloEditorial className="text-fluid-2xl text-titulo">
                Onde cada imóvel está
              </TituloEditorial>
              <Reveal from="nenhuma" delay={0.2}>
                <p className="text-fluid-base mt-3 max-w-xl text-apoio">
                  Cada ponto é um imóvel do catálogo. Toque no globo para abrir
                  o mapa da região.
                </p>
              </Reveal>

              <Reveal delay={0.1} from="baixo" className="mt-8 w-full">
                <GloboOuMapa
                  empreendimentos={todos}
                  alturaClasse="h-[62vh] min-h-[440px] max-h-[640px]"
                />
              </Reveal>

              <Reveal className="mt-6">
                <Link
                  href="/mapa"
                  className="text-fluid-sm font-medium text-acento-suave underline-offset-4 hover:underline"
                >
                  Abrir o mapa em tela cheia →
                </Link>
              </Reveal>
            </div>
          </section>
          )}

          {equipe.length > 0 && (
            <section className="bg-superficie/40 px-4 py-16 sm:px-8 sm:py-24">
              <div className="mx-auto w-full max-w-4xl">
                <p className="text-fluid-xs mb-3 tracking-[0.22em] text-acento-suave uppercase">
                  Atendimento
                </p>
                <TituloEditorial className="text-fluid-2xl text-titulo">
                  Equipe pronta para negociar
                </TituloEditorial>

                <div className="mt-8 grid w-full gap-4 sm:grid-cols-2">
                  {/* CartaoTilt no lugar do Reveal, não junto: o tilt já faz a
                      própria entrada (cortina de clip-path) e já assume a
                      opacidade. Somar o Reveal daria dois donos da mesma
                      propriedade — o caminho curto para o card sumir. */}
                  {equipe.map((c, i) => (
                    <CartaoTilt key={c.slug} indice={i} className="rounded-glass">
                      <CardCorretor corretor={c} compacto />
                    </CartaoTilt>
                  ))}
                </div>

                {corretores.length > equipe.length && (
                  <Reveal className="mt-8">
                    <Link
                      href="/corretores"
                      className="text-fluid-sm font-medium text-acento-suave underline-offset-4 hover:underline"
                    >
                      Ver toda a equipe →
                    </Link>
                  </Reveal>
                )}
              </div>
            </section>
          )}

          {/* A porta do vendedor — única rota da home para /anunciar-imovel. */}
          <section className="px-4 py-16 sm:px-8 sm:py-20">
            {/* CartaoTilt no lugar do Reveal: ele traz o brilho que segue o
                ponteiro e já faz a própria entrada. Somar o Reveal daria dois
                donos da opacidade. */}
            <CartaoTilt indice={0} className="mx-auto w-full max-w-4xl">
              <Link href={VENDEDOR.href} className="rounded-glass block">
                <GlassSurface preset="card" className="group flex flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
                  <div>
                    <h2 className="font-display text-fluid-xl text-titulo">{VENDEDOR.titulo}</h2>
                    <p className="text-fluid-sm mt-2 max-w-lg text-legenda">{VENDEDOR.texto}</p>
                  </div>
                  <span className="text-fluid-base shrink-0 font-medium text-acento-suave transition-colors group-hover:text-acento-intenso">
                    {VENDEDOR.cta} →
                  </span>
                </GlassSurface>
              </Link>
            </CartaoTilt>
          </section>

          <CtaFinal />

          <Reveal className="px-4 pb-16 text-center">
            <p className="text-fluid-sm text-legenda">{enderecoLinha}</p>
            <p className="text-fluid-xs mt-1 text-tenue">CRECI {site.creci}</p>
          </Reveal>
        </div>
      </main>

      {/* O CTA flutuante é escolha de cada página (ver layout do grupo) e vem
          DEPOIS do main: é `fixed`, então visualmente nada muda — mas na
          ordem de tabulação ele deixa de ser a primeira parada do conteúdo e
          vai para o fim, onde o canto da tela sugere que ele está. */}
      <WhatsappCta corretor={corretorAtivo ?? undefined} />
    </>
  );
}

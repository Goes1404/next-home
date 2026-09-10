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
import { FaixaDeProva } from "@/components/institucional/FaixaDeProva";
import { ScrollCue } from "@/components/home/ScrollCue";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getCorretores, getEmpreendimentos, getRegioesDisponiveis } from "@/lib/queries";
import { GloboOuMapa } from "@/components/mapa/GloboOuMapa";
import { enderecoLinha, site } from "@/lib/site";

export const metadata: Metadata = {
  // 39 + 12 do sufixo " · Next Home" = 51, dentro dos 60 do Google. O nome
  // completo saiu do título porque o sufixo já carrega a marca — repeti-la
  // gastava 31 caracteres para dizer duas vezes a mesma coisa.
  title: "Imóveis em Alphaville, Barueri e Região",
  description:
    "Apartamentos, casas e lançamentos em Alphaville, Barueri e Santana de Parnaíba. Veja fotos, plantas e condições, e agende sua visita.",
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

  let destaques = todos.filter((e) => e.destaque).slice(0, 6);
  if (destaques.length < 6) {
    const slugsDestaque = new Set(destaques.map((e) => e.slug));
    const restantes = todos.filter((e) => !slugsDestaque.has(e.slug));
    destaques = [...destaques, ...restantes.slice(0, 6 - destaques.length)];
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

          {/* A ponte para o conteúdo (09/09/2026). O herói terminava num vão
              escuro de meia tela e nada dizia que havia página embaixo — quem
              não rolava por hábito via uma busca e o fim. O rótulo conta o
              que há lá: é informação, não "role para baixo".

              `data-abertura` + `gsap-pending` pelo mesmo contrato dos irmãos:
              a AberturaHome é dona da opacidade (ela varre `[data-abertura]`)
              e o elemento nasce invisível, voltando sozinho se o JS falhar. */}
          <div data-abertura className="gsap-pending">
            <ScrollCue
              alvo="destaques"
              posicao="fluxo"
              label={`${destaques.length} em destaque, logo abaixo`}
            />
          </div>
        </section>

        {/* Do primeiro conteúdo em diante o fundo é OPACO, como na página do
            imóvel: é o que permite bandas de seção — sem fundo próprio não
            existe separação, tudo flutuava translúcido sobre o vídeo. */}
        <div className="relative bg-fundo pt-16 sm:pt-24">
          {/* PRODUTO PRIMEIRO. Antes, o primeiro imóvel aparecia a 2,9 telas
              de rolagem, atrás de três cards institucionais. Numa imobiliária
              o produto é a foto do imóvel — ela abre o conteúdo. */}
          {destaques.length > 0 && (
            <section id="destaques" className="scroll-mt-24 px-4 pb-16 sm:px-8 sm:pb-24">
              <div className="mx-auto w-full max-w-6xl">
                {/* O rótulo acima do título passou a CONTAR (09/09/2026).
                    "Selecionados" em versalete não dizia nada que o título já
                    não dissesse — era decoração com aparência de estrutura, e
                    igual em três seções seguidas. A fração diz o tamanho do
                    catálogo e por que estes três estão aqui. */}
                <p className="text-fluid-xs text-apoio mb-3">
                  <span className="text-acento-suave font-semibold tabular-nums">
                    {destaques.length}
                  </span>{" "}
                  de {todos.length} imóveis, escolhidos a dedo
                </p>
                <TituloEditorial className="text-fluid-2xl text-titulo">
                  Oportunidades em destaque
                </TituloEditorial>

                <div className="mt-10 grid w-full gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {destaques.map((e, i) => (
                    <Reveal key={e.slug} delay={(i % 3) * 0.1} from="baixo" className="h-full">
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

          {/*
            A FAIXA DE PROVA. Numa imobiliária a moeda é confiança, e a home
            não trazia nenhum número verificável — só promessa em prosa.

            Todos os quatro saem do banco nesta requisição (nenhuma consulta
            nova). A régua está em `FaixaDeProva`, que a página Sobre também
            usa — os mesmos números, a mesma peça.
          */}
          <div className="px-4 sm:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <FaixaDeProva
                numeros={[
                  { valor: todos.length, rotulo: todos.length === 1 ? "imóvel no catálogo" : "imóveis no catálogo" },
                  { valor: regioes.bairros.length, rotulo: "bairros atendidos" },
                  { valor: regioes.cidades.length, rotulo: regioes.cidades.length === 1 ? "cidade" : "cidades" },
                  { valor: corretores.length, rotulo: "com CRECI ativo" },
                ]}
              />
            </div>
          </div>

          {/* Regioes é compartilhado com o portfólio do corretor — a banda vem
              do embrulho, não de dentro do componente. */}
          <div className="bg-superficie/40 mt-16 sm:mt-24">
            <Regioes catalogo={todos} />
          </div>

          {/* Mapa geral: todos os imóveis com pin de localização; o clique
              abre o card com as características básicas e o botão de ver o
              imóvel (CardFlutuanteImovel, o mesmo da página /mapa). */}
          {todos.length > 0 && (
          <section className="px-4 py-16 sm:px-8 sm:py-24">
            <div className="mx-auto w-full max-w-6xl">
              <p className="text-fluid-xs text-apoio mb-3">
                <span className="text-acento-suave font-semibold tabular-nums">
                  {regioes.bairros.length}
                </span>{" "}
                bairros em {regioes.cidades.length} cidades
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
              <div className="mx-auto w-full max-w-6xl">
                <p className="text-fluid-xs text-apoio mb-3">
                  <span className="text-acento-suave font-semibold tabular-nums">
                    {corretores.length}
                  </span>{" "}
                  {corretores.length === 1 ? "corretor" : "corretores"} com CRECI, na região
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

          {/*
            COMO FUNCIONA. A home explicava o que a Next Home tem (imóveis,
            regiões, equipe) e nunca o que ACONTECE depois do clique — quem
            chega pelo Google não sabe se vai cair num formulário, numa
            ligação ou numa fila.

            Numerado porque isto é de fato uma SEQUÊNCIA: um passo depende do
            anterior. Numeração em conteúdo que não é sequência vira enfeite,
            e é justamente onde ela costuma aparecer sem razão.

            Os três passos descrevem o produto que existe hoje: o filtro do
            herói, o WhatsApp direto (sem formulário, é a decisão de sempre
            desta casa) e a visita marcada pela agenda do corretor.
          */}
          <section className="px-4 py-16 sm:px-8 sm:py-24">
            <div className="mx-auto w-full max-w-6xl">
              <p className="text-fluid-xs text-apoio mb-3">Três passos, sem formulário</p>
              <TituloEditorial className="text-fluid-2xl text-titulo">
                Do primeiro clique à visita
              </TituloEditorial>

              <ol className="mt-8 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    titulo: "Escolha o imóvel",
                    texto:
                      "Filtre por tipo, cidade e valor. Cada ficha traz fotos, plantas, lazer e o mapa da região.",
                  },
                  {
                    titulo: "Fale no WhatsApp",
                    texto:
                      "Sem formulário e sem espera: o botão abre a conversa com um corretor da equipe, com CRECI.",
                  },
                  {
                    titulo: "Visite",
                    texto:
                      "A gente marca no horário que o corretor de fato tem livre — e confirma a data com você.",
                  },
                ].map((passo, i) => (
                  /* `as="li"` e não um `<li>` dentro do Reveal: o padrão dele
                     é `div`, e `<ol><div><li>` é aninhamento inválido — o
                     leitor de tela deixa de anunciar "lista de 3 itens", que é
                     justamente o que a numeração está dizendo aos que enxergam. */
                  <Reveal
                    key={passo.titulo}
                    as="li"
                    delay={i * 0.1}
                    from="baixo"
                    className="border-linha bg-superficie/50 h-full rounded-2xl border p-5"
                  >
                    <span
                      aria-hidden
                      className="border-realce-linha bg-realce-lavado text-realce-suave font-display flex size-9 items-center justify-center rounded-full border text-sm font-bold tabular-nums"
                    >
                      {i + 1}
                    </span>
                    <h3 className="font-display text-titulo mt-4 text-lg">{passo.titulo}</h3>
                    <p className="text-fluid-sm text-apoio mt-2 text-pretty">{passo.texto}</p>
                  </Reveal>
                ))}
              </ol>
            </div>
          </section>

          {/* A porta do vendedor — única rota da home para /anunciar-imovel. */}
          <section className="px-4 py-16 sm:px-8 sm:py-24">
            {/* CartaoTilt no lugar do Reveal: ele traz o brilho que segue o
                ponteiro e já faz a própria entrada. Somar o Reveal daria dois
                donos da opacidade.

                `max-w-6xl` como o resto: até 09/09 esta seção era 4xl e a
                caixa nascia 128px mais para dentro que a de cima — a margem
                esquerda da página PULAVA a cada rolagem. */}
            <CartaoTilt indice={0} className="rounded-glass mx-auto w-full max-w-6xl">
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

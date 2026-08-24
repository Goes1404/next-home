import type { Metadata } from "next";
import Link from "next/link";
import { FiltroForm } from "@/components/busca/FiltroForm";
import { CardCorretor } from "@/components/corretores/CardCorretor";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CtaFinal } from "@/components/home/CtaFinal";
import { Regioes } from "@/components/home/Regioes";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getCorretores, getEmpreendimentos, getRegioesDisponiveis } from "@/lib/queries";
import { MapaEmpreendimentos } from "@/components/mapa/MapaEmpreendimentos";
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

/** Os três caminhos que trazem alguém a uma imobiliária. */
const CAMINHOS = [
  {
    href: "/empreendimentos",
    titulo: "Quero Comprar",
    texto:
      "Apartamentos na planta e prontos para morar com condições facilitadas, lazer completo e localizações estratégicas em Alphaville e região.",
    cta: "Ver Melhores Oportunidades",
  },
  {
    href: "/anunciar-imovel",
    titulo: "Vender ou Anunciar",
    texto:
      "Venda seu imóvel mais rápido com quem tem compradores ativos, divulgação estratégica e assessoria completa do início ao fim.",
    cta: "Anunciar com Quem Vende",
  },
  {
    href: "/corretores",
    titulo: "Atendimento Personalizado",
    texto:
      "Tire dúvidas, faça simulações de financiamento e receba opções que cabem no seu orçamento direto com nossos corretores no WhatsApp.",
    cta: "Falar com Corretor",
  },
];

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

      {/* O CTA flutuante deixou de vir do layout do grupo (ver
          `(institucional)/layout.tsx`) e agora é escolha de cada página. */}
      <WhatsappCta corretor={corretorAtivo ?? undefined} />

      <main className="flex flex-1 flex-col">
        {/* Altura de tela só a partir de `sm`: no telefone o conjunto título +
            texto + busca é mais alto que a viewport, e forçar `min-h-svh` faria
            o conteúdo transbordar a caixa centralizada e cair atrás do CTA
            flutuante do WhatsApp, que é `fixed`. */}
        <section className="flex flex-col items-center justify-center px-4 pt-24 pb-32 sm:min-h-svh sm:pt-28 sm:pb-20">
          <div className="w-full max-w-4xl text-center">
            <Reveal from="nenhuma" duration={0.7}>
              <p className="text-fluid-xs mb-4 font-medium tracking-[0.2em] text-acento-suave uppercase">
                Imóveis & Oportunidades · Alphaville, Barueri e Região
              </p>
            </Reveal>
            <TituloEditorial as="h1" className="text-fluid-4xl leading-[1.05] tracking-tight text-titulo">
              A melhor oportunidade para morar bem ou investir na região que mais valoriza.
            </TituloEditorial>
            <Reveal from="nenhuma" delay={0.4}>
              <p className="text-fluid-base mx-auto mt-6 max-w-xl text-corpo-suave">
                Lançamentos na planta, apartamentos modernos e casas selecionadas com condições facilitadas de pagamento. Atendimento direto e ágil no WhatsApp.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.12} className="mt-8 w-full max-w-3xl sm:mt-10">
            <GlassSurface preset="painel" className="px-5 py-5 sm:px-7 sm:py-7">
              <FiltroForm
                compacto
                filtrosAtuais={{}}
                ordenacaoAtual="destaque"
                regioes={regioes}
                idPrefixo="hero"
              />
            </GlassSurface>
          </Reveal>
        </section>

        <section className="px-4 pb-20">
          <div className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-3">
            {CAMINHOS.map((c, i) => (
              <Reveal key={c.href} delay={i * 0.1} from="baixo">
                <Link href={c.href} className="rounded-glass block h-full">
                  <GlassSurface
                    preset="card"
                    className="group flex h-full flex-col px-6 py-7"
                  >
                    <h2 className="font-display text-lg text-titulo">{c.titulo}</h2>
                    <p className="text-fluid-sm mt-2 flex-1 text-legenda">{c.texto}</p>
                    <span className="text-fluid-sm mt-5 font-medium text-acento-suave transition-colors group-hover:text-acento-intenso">
                      {c.cta} →
                    </span>
                  </GlassSurface>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>

        {destaques.length > 0 && (
          <section className="px-4 pb-24">
            <Reveal className="mx-auto max-w-lg text-center">
              <TituloEditorial className="text-fluid-2xl text-titulo">Oportunidades em Destaque</TituloEditorial>
              <p className="text-fluid-base mt-3 text-apoio">
                Projetos com excelente potencial de valorização, infraestrutura completa e condições especiais de lançamento.
              </p>
            </Reveal>

            <div className="mx-auto mt-10 grid w-full max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {destaques.map((e, i) => (
                <Reveal key={e.slug} delay={i * 0.1} from="baixo">
                  <CardEmpreendimento empreendimento={e} prioridade={i < 3} />
                </Reveal>
              ))}
            </div>

            <Reveal className="mt-10 text-center">
              <Link
                href="/empreendimentos"
                className="text-fluid-sm font-medium text-acento-suave underline-offset-4 hover:underline"
              >
                Ver todos os {todos.length} empreendimentos →
              </Link>
            </Reveal>
          </section>
        )}

        <Regioes />

        {/* Mapa geral: todos os imóveis com pin de localização; o clique
            abre o card com as características básicas e o botão de ver o
            imóvel (CardFlutuanteImovel, o mesmo da página /mapa). */}
        <section className="px-4 pb-24">
          <Reveal className="mx-auto max-w-lg text-center">
            <TituloEditorial className="text-fluid-2xl text-titulo">Onde Cada Imóvel Está</TituloEditorial>
            <p className="text-fluid-base mt-3 text-apoio">
              Explore o mapa da região: toque em um marcador para ver preço, endereço e abrir o
              imóvel completo.
            </p>
          </Reveal>

          <Reveal delay={0.1} from="baixo" className="mx-auto mt-10 w-full max-w-6xl">
            <MapaEmpreendimentos
              empreendimentos={todos}
              alturaClasse="h-[62vh] min-h-[440px] max-h-[640px]"
            />
          </Reveal>

          <Reveal className="mt-8 text-center">
            <Link
              href="/mapa"
              className="text-fluid-sm font-medium text-acento-suave underline-offset-4 hover:underline"
            >
              Abrir o mapa em tela cheia →
            </Link>
          </Reveal>
        </section>

        {equipe.length > 0 && (
          <section className="px-4 pb-24">
            <Reveal className="mx-auto max-w-lg text-center">
              <TituloEditorial className="text-fluid-2xl text-titulo">Equipe Pronta para Negociar</TituloEditorial>
              <p className="text-fluid-base mt-3 text-apoio">
                Corretores especializados prontos para tirar dúvidas, calcular financiamento e encontrar a melhor proposta para você.
              </p>
            </Reveal>

            <div className="mx-auto mt-10 grid w-full max-w-4xl gap-4 sm:grid-cols-2">
              {equipe.map((c, i) => (
                <Reveal key={c.slug} delay={i * 0.08} from="baixo">
                  <CardCorretor corretor={c} compacto />
                </Reveal>
              ))}
            </div>

            {corretores.length > equipe.length && (
              <Reveal className="mt-10 text-center">
                <Link
                  href="/corretores"
                  className="text-fluid-sm font-medium text-acento-suave underline-offset-4 hover:underline"
                >
                  Ver toda a equipe →
                </Link>
              </Reveal>
            )}
          </section>
        )}

        <CtaFinal />

        <Reveal className="px-4 pb-20 text-center">
          <p className="text-fluid-sm text-legenda">{enderecoLinha}</p>
          <p className="text-fluid-xs mt-1 text-tenue">CRECI {site.creci}</p>
        </Reveal>
      </main>
    </>
  );
}

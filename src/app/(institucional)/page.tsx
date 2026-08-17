import type { Metadata } from "next";
import Link from "next/link";
import { FiltroForm } from "@/components/busca/FiltroForm";
import { CardCorretor } from "@/components/corretores/CardCorretor";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CtaFinal } from "@/components/home/CtaFinal";
import { Regioes } from "@/components/home/Regioes";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretores, getEmpreendimentos, getRegioesDisponiveis } from "@/lib/queries";
import { enderecoLinha, site } from "@/lib/site";

export const metadata: Metadata = {
  title: `${site.nomeCompleto} — Imobiliária em Alphaville, Barueri e região`,
  description: site.descricao,
  alternates: { canonical: "/" },
};

/** Os três caminhos que trazem alguém a uma imobiliária. */
const CAMINHOS = [
  {
    href: "/empreendimentos",
    titulo: "Quero comprar",
    texto:
      "Lançamentos e oportunidades selecionadas em Alphaville e região, cada um com página própria — plantas, lazer e localização.",
    cta: "Ver imóveis",
  },
  {
    href: "/anunciar-imovel",
    titulo: "Tenho um imóvel",
    texto:
      "Anuncie com quem conhece o metro quadrado da região e cuida da negociação do começo ao fim, com CRECI e contrato.",
    cta: "Anunciar meu imóvel",
  },
  {
    href: "/corretores",
    titulo: "Quero falar com alguém",
    texto:
      "Nada de fila de atendimento genérico: escolha o corretor e fale direto no WhatsApp com quem acompanha o lançamento.",
    cta: "Conhecer a equipe",
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
  const [todos, regioes, corretores] = await Promise.all([
    getEmpreendimentos(),
    getRegioesDisponiveis(),
    getCorretores(),
  ]);

  const destaques = todos.filter((e) => e.destaque).slice(0, 3);
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

      <main className="flex flex-1 flex-col">
        {/* Altura de tela só a partir de `sm`: no telefone o conjunto título +
            texto + busca é mais alto que a viewport, e forçar `min-h-svh` faria
            o conteúdo transbordar a caixa centralizada e cair atrás do CTA
            flutuante do WhatsApp, que é `fixed`. */}
        <section className="flex flex-col items-center justify-center px-4 pt-24 pb-32 sm:min-h-svh sm:pt-28 sm:pb-20">
          <Reveal className="w-full max-w-3xl text-center">
            <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
              CRECI {site.creci} · {site.endereco.bairro}
            </p>
            <h1 className="text-fluid-3xl text-mist-50">
              A imobiliária que conhece Alphaville rua por rua.
            </h1>
            <p className="text-fluid-base mx-auto mt-5 max-w-xl text-mist-200">
              {todos.length} empreendimentos selecionados, cada um com um corretor responsável
              acompanhando de perto.
            </p>
          </Reveal>

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
                    <h2 className="font-display text-lg text-mist-50">{c.titulo}</h2>
                    <p className="text-fluid-sm mt-2 flex-1 text-mist-400">{c.texto}</p>
                    <span className="text-fluid-sm mt-5 font-medium text-brand-200 transition-colors group-hover:text-brand-100">
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
              <h2 className="text-fluid-2xl text-mist-50">Em destaque agora</h2>
              <p className="text-fluid-base mt-3 text-mist-300">
                Uma curadoria dos lançamentos que mais pedem atenção.
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
                className="text-fluid-sm font-medium text-brand-200 underline-offset-4 hover:underline"
              >
                Ver todos os {todos.length} empreendimentos →
              </Link>
            </Reveal>
          </section>
        )}

        <Regioes />

        {equipe.length > 0 && (
          <section className="px-4 pb-24">
            <Reveal className="mx-auto max-w-lg text-center">
              <h2 className="text-fluid-2xl text-mist-50">Fale com um corretor</h2>
              <p className="text-fluid-base mt-3 text-mist-300">
                Todos com CRECI, todos na região. Escolha quem vai te atender.
              </p>
            </Reveal>

            <div className="mx-auto mt-10 grid w-full max-w-4xl gap-4 sm:grid-cols-2">
              {equipe.map((c, i) => (
                <Reveal key={c.slug} delay={i * 0.08} from="baixo">
                  <CardCorretor corretor={c} />
                </Reveal>
              ))}
            </div>

            {corretores.length > equipe.length && (
              <Reveal className="mt-10 text-center">
                <Link
                  href="/corretores"
                  className="text-fluid-sm font-medium text-brand-200 underline-offset-4 hover:underline"
                >
                  Ver toda a equipe →
                </Link>
              </Reveal>
            )}
          </section>
        )}

        <CtaFinal />

        <Reveal className="px-4 pb-20 text-center">
          <p className="text-fluid-sm text-mist-400">{enderecoLinha}</p>
          <p className="text-fluid-xs mt-1 text-mist-500">CRECI {site.creci}</p>
        </Reveal>
      </main>
    </>
  );
}

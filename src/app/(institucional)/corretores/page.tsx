import type { Metadata } from "next";
import Link from "next/link";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { CardCorretor } from "@/components/corretores/CardCorretor";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getAtuacaoPorCorretor, getCorretores } from "@/lib/queries";
import { linkWhatsapp, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Corretores de Imóveis em Alphaville",
  description: `Fale com consultores credenciados CRECI ${site.creci}. Especialistas em compra, venda e investimento em Alphaville, Barueri e região.`,
  alternates: { canonical: "/corretores" },
  openGraph: {
    title: "Equipe de Corretores de Imóveis | Next Home Alphaville",
    description:
      "Atendimento consultivo e personalizado com corretores credenciados em Alphaville e região.",
    url: `${site.url}/corretores`,
  },
};

/**
 * Vitrine da equipe.
 *
 * A página tem um trabalho só: fazer o visitante escolher uma pessoa e falar
 * com ela. Por isso cada card carrega o próprio botão de WhatsApp (ver
 * CardCorretor) e a listagem termina com uma saída para quem não quer
 * escolher — sem ela, quem chega indeciso volta para o header.
 */
export default async function CorretoresPage() {
  const [corretores, atuacao, corretorAtivo] = await Promise.all([
    getCorretores(),
    getAtuacaoPorCorretor(),
    getCorretorAtivo(),
  ]);

  const quantos = corretores.length;

  return (
    <>
      <Pagina>
        <Secao espaco="abertura">
          <CabecalhoDePagina
            atual="Corretores"
            rotulo={
              quantos > 0 ? (
                <>
                  <span className="text-acento-suave font-semibold tabular-nums">{quantos}</span>{" "}
                  {quantos === 1 ? "corretor" : "corretores"} com CRECI, em{" "}
                  {site.regioes.slice(0, 3).join(", ")} e região
                </>
              ) : (
                "Equipe com CRECI"
              )
            }
            titulo="Quem acompanha cada lançamento de perto"
            lead="Escolha com quem falar e chame direto no WhatsApp — sem fila de atendimento. Cada perfil mostra o que a pessoa acompanha hoje, para você achar quem conhece a região que procura."
          />
        </Secao>

        <Secao espaco="final">
          {quantos === 0 ? (
            <Reveal className="mx-auto w-full max-w-lg">
              <GlassSurface preset="painel" className="px-7 py-8 text-center">
                <h2 className="text-fluid-lg font-display text-titulo">
                  Estamos atualizando a equipe.
                </h2>
                <p className="text-fluid-base text-apoio mt-3">
                  Fale com a gente pelo WhatsApp que direcionamos você ao corretor certo para o
                  que você procura.
                </p>
                <WhatsappLink
                  href={linkWhatsapp()}
                  origem="corretores"
                  className="bg-acento text-sobre-cor hover:bg-acento-hover mt-6 inline-flex min-h-12 items-center rounded-full px-7 text-sm font-medium transition-colors"
                >
                  Falar no WhatsApp
                </WhatsappLink>
              </GlassSurface>
            </Reveal>
          ) : (
            <>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {corretores.map((c, i) => (
                  // Um Reveal por card, em vez de um `stagger` na grade inteira:
                  // o GSAP deixa um `transform` inline no que anima, e ele
                  // venceria o `hover:-translate-y` do card.
                  <Reveal key={c.slug} as="li" delay={(i % 3) * 0.08} from="baixo" className="h-full">
                    <CardCorretor corretor={c} atuacao={atuacao[c.id]} />
                  </Reveal>
                ))}
              </ul>

              <Reveal className="mt-12" from="baixo">
                <GlassSurface
                  preset="painel"
                  className="flex flex-col items-center gap-5 px-7 py-7 text-center sm:flex-row sm:justify-between sm:text-left"
                >
                  <div className="sm:flex-1">
                    <p className="font-display text-fluid-lg text-titulo">Não sabe com quem falar?</p>
                    <p className="text-fluid-sm text-apoio mt-1 text-pretty">
                      Conte o que procura na linha geral e direcionamos ao corretor da região
                      certa.
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
                    <WhatsappLink
                      href={linkWhatsapp()}
                      origem="corretores"
                      className="bg-acento text-sobre-cor hover:bg-acento-hover inline-flex min-h-12 items-center rounded-full px-6 text-sm font-medium transition-colors"
                    >
                      Falar no WhatsApp
                    </WhatsappLink>
                    <Link
                      href="/contato"
                      className="border-linha text-corpo hover:border-acento-linha hover:text-acento-suave inline-flex min-h-12 items-center rounded-full border px-6 text-sm font-medium transition-colors"
                    >
                      Enviar mensagem
                    </Link>
                  </div>
                </GlassSurface>
              </Reveal>
            </>
          )}
        </Secao>
      </Pagina>

      <WhatsappCta corretor={corretorAtivo ?? undefined} />
    </>
  );
}

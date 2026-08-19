import type { Metadata } from "next";
import Link from "next/link";
import { CardCorretor } from "@/components/corretores/CardCorretor";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getAtuacaoPorCorretor, getCorretores } from "@/lib/queries";
import { linkWhatsapp, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Nossos Corretores de Imóveis em Alphaville | Next Home",
  description: `Fale com consultores imobiliários credenciados CRECI ${site.creci} da ${site.nomeCompleto}. Especialistas em compra, venda e investimentos em ${site.regioes.join(", ")}.`,
  alternates: { canonical: "/corretores" },
  openGraph: {
    title: "Equipe de Corretores de Imóveis | Next Home Alphaville",
    description: "Atendimento consultivo e personalizado com corretores credenciados em Alphaville e região.",
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

  return (
    <main className="flex flex-1 flex-col px-4 pt-32 pb-24">
      <Reveal className="mx-auto w-full max-w-2xl text-center">
        <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-brand-200 uppercase">
          Consultoria Especializada
        </p>
        <h1 className="text-fluid-3xl text-mist-50">
          Especialistas dedicados a encontrar o imóvel ideal para você.
        </h1>
        <p className="text-fluid-base mt-5 text-mist-300">
          Nossa equipe credenciada tem vivência real em Alphaville e região. Escolha seu consultor ou inicie uma conversa agora no WhatsApp para um atendimento ágil e personalizado.
        </p>
      </Reveal>

      <main className="flex flex-1 flex-col px-4 pt-32 pb-24">
        <Reveal className="mx-auto w-full max-w-2xl text-center">
          <p className="text-fluid-xs text-brand-200 mb-3 font-medium tracking-[0.2em] uppercase">
            Nossa equipe
          </p>
          <h1 className="text-fluid-3xl text-mist-50">
            Quem acompanha cada lançamento de perto.
          </h1>
          <p className="text-fluid-base mt-5 text-mist-300">
            {corretores.length > 0 ? (
              <>
                São {corretores.length} corretores com CRECI, todos atuando em{" "}
                {site.regioes.slice(0, 3).join(", ")} e região. Escolha com quem falar e
                chame direto no WhatsApp — sem fila de atendimento.
              </>
            ) : (
              <>Todo corretor da Next Home tem CRECI e conhece a região rua por rua.</>
            )}
          </p>
        </Reveal>

        {corretores.length === 0 ? (
          <Reveal className="mx-auto mt-14 w-full max-w-lg">
            <GlassSurface preset="painel" className="px-7 py-8 text-center">
              <h2 className="text-fluid-lg font-display text-mist-50">
                Estamos atualizando a equipe.
              </h2>
              <p className="text-fluid-base mt-3 text-mist-300">
                Fale com a gente pelo WhatsApp que direcionamos você ao corretor certo
                para o que você procura.
              </p>
              <a
                href={linkWhatsapp()}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-brand-500 hover:bg-brand-400 mt-6 inline-flex h-12 items-center rounded-full px-7 text-sm font-medium text-white transition-colors"
              >
                Falar no WhatsApp
              </a>
            </GlassSurface>
          </Reveal>
        ) : (
          <>
            <div className="mx-auto mt-14 grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {corretores.map((c, i) => (
                // Um Reveal por card, em vez de um `stagger` na grade inteira: o
                // GSAP deixa um `transform` inline no que anima, e ele venceria o
                // `hover:-translate-y` do card, matando o realce ao passar o mouse.
                <Reveal key={c.slug} delay={i * 0.06} from="baixo">
                  <CardCorretor corretor={c} atuacao={atuacao[c.id]} />
                </Reveal>
              ))}
            </div>

            <Reveal className="mx-auto mt-14 w-full max-w-5xl" from="baixo">
              <GlassSurface
                preset="painel"
                className="flex flex-col items-center gap-5 px-7 py-7 text-center sm:flex-row sm:justify-between sm:text-left"
              >
                <div className="sm:flex-1">
                  <p className="font-display text-fluid-lg text-mist-50">
                    Não sabe com quem falar?
                  </p>
                  <p className="text-fluid-sm mt-1 text-mist-300">
                    Conte o que procura na linha geral e direcionamos ao corretor da
                    região certa.
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center justify-center gap-3">
                  <a
                    href={linkWhatsapp()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-brand-500 hover:bg-brand-400 inline-flex h-12 items-center rounded-full px-6 text-sm font-medium text-white transition-colors"
                  >
                    Falar no WhatsApp
                  </a>
                  <Link
                    href="/contato"
                    className="hover:border-brand-300/50 hover:text-brand-200 inline-flex h-12 items-center rounded-full border border-white/20 px-6 text-sm font-medium text-mist-100 transition-colors"
                  >
                    Enviar mensagem
                  </Link>
                </div>
              </GlassSurface>
            </Reveal>
          </>
        )}
      </main>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { AtalhosDeFaixa, Simulador } from "@/components/financiamento/Simulador";
import { CtaFinal } from "@/components/home/CtaFinal";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { getEmpreendimentos } from "@/lib/queries";
import { linkWhatsapp, site } from "@/lib/site";

/**
 * "Quanto cabe no meu bolso" — a primeira pergunta de quem compra o primeiro
 * imóvel, e a que o site não respondia.
 *
 * ## Por que esta página, e não mais uma de conteúdo
 *
 * O catálogo já tem listagem, ficha, mapa e região. O que faltava não era
 * mais vitrine: era a conta que decide se a pessoa continua olhando. Ela
 * também é a única página aqui com intenção de busca própria e forte
 * ("financiamento minha casa minha vida", "quanto de renda para financiar").
 *
 * ## A conta é a MESMA do corretor
 *
 * `simularFinanciamento` é o módulo que o consultor do painel usa, puro e
 * testado. Duas contas do mesmo financiamento divergiriam, e o cliente
 * ouviria um número no site e outro do corretor — o jeito mais rápido de
 * perder a conversa que o site conquistou.
 *
 * ## Os parâmetros vêm do banco, não de constante
 *
 * Taxa, faixas do MCMV e teto de FGTS mudam por decisão de governo. Ficam em
 * `parametros_credito`, que o gestor edita no painel, e a página mostra
 * QUANDO foram conferidos pela última vez — número de crédito sem data é
 * número em que ninguém pode confiar.
 */

export const metadata: Metadata = {
  title: "Simulador de financiamento",
  description:
    "Descubra em segundos quanto você consegue financiar, a parcela estimada e se entra no Minha Casa Minha Vida. Simulação gratuita, sem cadastro.",
  alternates: { canonical: `${site.url}/financiamento` },
};

/** Revalida com o catálogo: imóvel novo entra nas sugestões em 5 minutos. */
export const revalidate = 300;

export default async function PaginaFinanciamento() {
  const [parametros, catalogo, corretorAtivo] = await Promise.all([
    getParametrosCredito(),
    getEmpreendimentos(),
    getCorretorAtivo(),
  ]);

  const comPreco = catalogo
    .filter((e) => typeof e.precoAPartir === "number" && e.precoAPartir > 0)
    .sort((a, b) => (a.precoAPartir ?? 0) - (b.precoAPartir ?? 0));

  // Os três mais acessíveis: quem chega por "financiamento" costuma estar
  // comprando o primeiro imóvel, e mostrar o topo da tabela seria responder
  // outra pergunta.
  const acessiveis = comPreco.slice(0, 3);

  const conferidoEm = new Date(`${parametros.conferidoEm}T12:00:00-03:00`).toLocaleDateString(
    "pt-BR",
    { day: "2-digit", month: "long", year: "numeric" },
  );

  /*
   * Os atalhos saem do CATÁLOGO, não de faixas redondas escritas à mão: um
   * chip "até R$ 300 mil" que devolve lista vazia é o defeito que a seção de
   * regiões tinha (ver `lib/regioes.ts`). Cada corte só aparece se houver
   * imóvel dentro dele.
   */
  const cortes = [400_000, 600_000, 900_000];
  const faixas = cortes
    .filter((teto) => comPreco.some((e) => (e.precoAPartir ?? 0) <= teto))
    .map((teto) => ({
      rotulo: `Até ${formatarMoedaBRL(teto)}`,
      href: `/empreendimentos?precoMax=${teto}`,
    }));

  const perguntas = [
    {
      p: "Quanto de renda preciso para financiar?",
      r: `Os bancos costumam aceitar parcela de até ${Math.round(parametros.comprometimentoMaximo * 100)}% da renda familiar. A simulação acima já aplica esse limite e mostra a parcela máxima que a sua renda sustenta.`,
    },
    {
      p: "Posso usar o FGTS?",
      r: `Sim, na compra de imóvel residencial urbano de até ${formatarMoedaBRL(parametros.tetoFgtsImovel)}, se você tiver três anos de trabalho sob o regime e não for dono de outro imóvel na mesma região. O simulador considera o saldo que você informar.`,
    },
    {
      p: "O que é o Minha Casa Minha Vida?",
      r: "É o programa federal que reduz os juros e pode dar subsídio, conforme a renda familiar. A simulação identifica sua faixa automaticamente e usa a taxa dela.",
    },
    {
      p: "Além da entrada, o que mais vou pagar?",
      r: "ITBI e registro em cartório, que juntos costumam ficar em torno de 3% a 4% do valor do imóvel. O simulador estima o ITBI; o registro varia por cartório e entra na conta final com o corretor.",
    },
    {
      p: "Essa simulação vale como aprovação?",
      r: "Não. Ela mostra o que a matemática permite, com as regras públicas de crédito. Quem aprova é o banco, que também olha cadastro, histórico e a avaliação do imóvel.",
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: perguntas.map((q) => ({
      "@type": "Question",
      name: q.p,
      acceptedAnswer: { "@type": "Answer", text: q.r },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Pagina>
        <Secao espaco="abertura">
          <CabecalhoDePagina
            atual="Financiamento"
            rotulo="Gratuito e sem cadastro"
            titulo="Quanto cabe no seu bolso"
            lead="Informe quatro números e veja na hora a parcela estimada, quanto dá para financiar e se você entra no Minha Casa Minha Vida. Nada é enviado para a gente — a conta acontece no seu próprio navegador."
          />
        </Secao>

        <Secao espaco="final">
          <Reveal>
            <Simulador parametros={parametros} whatsapp={linkWhatsapp()} />
          </Reveal>

          <p className="text-fluid-xs text-tenue mt-5">
            Taxas e faixas conferidas em {conferidoEm}.
          </p>
        </Secao>

        {acessiveis.length > 0 && (
          <Secao banda>
            <p className="text-fluid-xs text-apoio mb-3">Os mais acessíveis do catálogo</p>
            <TituloEditorial className="text-fluid-2xl text-titulo">
              Comece por estes
            </TituloEditorial>

            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {acessiveis.map((e, i) => (
                <Reveal key={e.slug} as="li" delay={(i % 3) * 0.08} from="baixo" className="h-full">
                  <CardEmpreendimento empreendimento={e} />
                </Reveal>
              ))}
            </ul>

            {faixas.length > 0 && (
              <Reveal delay={0.1}>
                <AtalhosDeFaixa faixas={faixas} />
              </Reveal>
            )}
          </Secao>
        )}

        <Secao>
          <TituloEditorial className="text-fluid-2xl text-titulo">
            Perguntas que todo mundo faz
          </TituloEditorial>

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {perguntas.map((q, i) => (
              <Reveal key={q.p} delay={(i % 2) * 0.08} from="baixo">
                <div className="border-linha bg-superficie/50 h-full rounded-2xl border p-5">
                  <dt className="font-display text-titulo text-lg text-pretty">{q.p}</dt>
                  <dd className="text-fluid-sm text-apoio mt-2 text-pretty">{q.r}</dd>
                </div>
              </Reveal>
            ))}
          </dl>

          <Reveal delay={0.1}>
            <p className="text-fluid-sm text-apoio mt-8 text-pretty">
              Ainda com dúvida?{" "}
              <Link
                href="/corretores"
                className="text-acento-suave font-medium underline-offset-4 hover:underline"
              >
                Fale com um corretor da equipe
              </Link>{" "}
              — todos com CRECI, sem custo nenhum para você.
            </p>
          </Reveal>
        </Secao>

        <CtaFinal />
      </Pagina>

      <WhatsappCta corretor={corretorAtivo ?? undefined} />
    </>
  );
}

import type { Metadata } from "next";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { FormularioProprietario } from "@/components/contato/FormularioProprietario";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";
import { Shield, Handshake, Sparkles, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "Anunciar Imóvel em Alphaville e Barueri",
  description: `Avaliação real de mercado, compradores já cadastrados e suporte jurídico. Venda ou alugue com a Next Home — CRECI ${site.creci}.`,
  alternates: { canonical: "/anunciar-imovel" },
  openGraph: {
    title: "Anuncie seu Imóvel | Next Home Negócios Imobiliários",
    description:
      "Venda ou alugue com agilidade, divulgação nos principais portais e assessoria completa.",
    url: `${site.url}/anunciar-imovel`,
  },
};

/** Numerado porque é uma SEQUÊNCIA de verdade: cada passo depende do anterior. */
const ETAPAS = [
  {
    titulo: "Envie os dados do imóvel",
    texto: "Em menos de um minuto, pelo formulário abaixo — ou mande as fotos direto no WhatsApp.",
  },
  {
    titulo: "Avaliação de mercado",
    texto:
      "Comparamos com o que está à venda e com o que vendeu na região, para precificar com liquidez.",
  },
  {
    titulo: "Divulgação e contrato",
    texto:
      "Anúncio nos portais, apresentação para quem já está procurando, e um corretor com CRECI cuidando do contrato.",
  },
];

const MOTIVOS = [
  { Icone: Sparkles, texto: "Compradores que já estão procurando na região." },
  { Icone: Zap, texto: "Divulgação no Zap, VivaReal, OLX e redes sociais." },
  { Icone: Shield, texto: "Documentação e contrato conferidos por quem tem CRECI." },
  { Icone: Handshake, texto: "Um corretor acompanhando do anúncio à escritura." },
];

export default async function AnunciarImovelPage() {
  const corretorAtivo = await getCorretorAtivo();
  const whatsapp = corretorAtivo
    ? linkWhatsappPara(
        corretorAtivo.whatsapp,
        `Olá, ${corretorAtivo.nome}! Tenho um imóvel e quero anunciar com a Next Home.`,
      )
    : linkWhatsapp("Olá! Quero anunciar meu imóvel com a Next Home e solicitar uma avaliação.");

  return (
    <>
      <Pagina>
        <Secao espaco="abertura">
          <CabecalhoDePagina
            atual="Anunciar imóvel"
            rotulo="Para proprietários"
            titulo="Venda ou alugue com quem já tem comprador"
            lead="Avaliação de mercado gratuita, divulgação nos portais e no WhatsApp de quem está procurando, e um corretor com CRECI cuidando do contrato. Sem custo até fechar."
          />
        </Secao>

        <Secao espaco="final">
          <ol className="grid gap-4 sm:grid-cols-3">
            {ETAPAS.map((etapa, i) => (
              <Reveal
                key={etapa.titulo}
                as="li"
                delay={i * 0.1}
                from="baixo"
                className="border-linha bg-superficie/50 h-full rounded-2xl border p-5"
              >
                <span
                  aria-hidden
                  className="border-acento-linha text-acento-suave font-display flex size-9 items-center justify-center rounded-full border text-sm font-bold tabular-nums"
                >
                  {i + 1}
                </span>
                <h2 className="font-display text-titulo mt-4 text-lg">{etapa.titulo}</h2>
                <p className="text-fluid-sm text-apoio mt-2 text-pretty">{etapa.texto}</p>
              </Reveal>
            ))}
          </ol>

          <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
            <Reveal className="border-linha bg-superficie/50 rounded-2xl border p-5 sm:p-8">
              <h2 className="font-display text-titulo text-lg">Cadastre seu imóvel</h2>
              <p className="text-fluid-sm text-apoio mt-1 mb-6">
                Rápido, sem compromisso e com avaliação de mercado gratuita.
              </p>
              <FormularioProprietario regioes={[...site.regioes]} />
            </Reveal>

            <div className="space-y-6">
              <Reveal delay={0.1} className="border-linha bg-superficie/50 rounded-2xl border p-5 sm:p-6">
                <h2 className="font-display text-titulo text-lg">Prefere falar direto?</h2>
                <p className="text-fluid-sm text-apoio mt-2 text-pretty">
                  {corretorAtivo
                    ? `Converse com ${corretorAtivo.nome} no WhatsApp e mande as fotos por lá.`
                    : "Chame no WhatsApp, mande as fotos por lá e receba a avaliação na conversa."}
                </p>
                <WhatsappLink
                  href={whatsapp}
                  origem="anunciar_imovel"
                  corretorId={corretorAtivo?.id}
                  className="bg-acento text-sobre-cor hover:bg-acento-hover mt-5 inline-flex min-h-12 items-center rounded-full px-6 text-sm font-medium transition-colors"
                >
                  Falar no WhatsApp
                </WhatsappLink>
              </Reveal>

              <Reveal delay={0.15} className="border-linha bg-superficie/50 rounded-2xl border p-5 sm:p-6">
                <h2 className="font-display text-titulo text-lg">O que você leva</h2>
                <ul className="text-fluid-sm text-apoio mt-3 space-y-2.5">
                  {MOTIVOS.map(({ Icone, texto }) => (
                    <li key={texto} className="flex items-start gap-2.5">
                      <Icone aria-hidden className="text-acento-suave mt-0.5 size-4 shrink-0" />
                      <span className="text-pretty">{texto}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-fluid-xs text-tenue mt-4">
                  {site.nomeCompleto} · CRECI {site.creci}
                </p>
              </Reveal>
            </div>
          </div>
        </Secao>
      </Pagina>

      <WhatsappCta corretor={corretorAtivo ?? undefined} />
    </>
  );
}

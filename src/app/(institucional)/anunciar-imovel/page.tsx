import type { Metadata } from "next";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { FormularioProprietario } from "@/components/contato/FormularioProprietario";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";
import { Shield, Handshake, Sparkles, Zap, Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Anunciar Imóvel em Alphaville, Barueri e Região | Avaliação Gratuita",
  description: `Venda ou alugue seu imóvel mais rápido com a ${site.nomeCompleto} — CRECI ${site.creci}. Avaliação real de mercado, compradores ativos cadastrados e suporte jurídico em ${site.regioes.join(", ")}.`,
  alternates: { canonical: "/anunciar-imovel" },
  openGraph: {
    title: "Anuncie seu Imóvel | Next Home Negócios Imobiliários",
    description: `Venda ou alugue com agilidade, divulgação nos principais portais e assessoria completa.`,
    url: `${site.url}/anunciar-imovel`,
  },
};

const ETAPAS = [
  {
    titulo: "Envie os Dados do Imóvel",
    texto: "Em menos de 1 minuto, preencha o formulário rápido abaixo ou envie fotos direto no WhatsApp.",
  },
  {
    titulo: "Avaliação Justa de Mercado",
    texto: "Analisamos o valor real de mercado e a concorrência na região para precificar com alta liquidez e retorno.",
  },
  {
    titulo: "Divulgação Ativa e Venda Rápida",
    texto: "Anunciamos nos maiores portais, apresentamos para nossa carteira de clientes ativos e cuidamos de todo o contrato.",
  },
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
    <main className="flex flex-1 flex-col px-4 pt-32 pb-24">
      <WhatsappCta corretor={corretorAtivo ?? undefined} />

      <Reveal className="mx-auto w-full max-w-2xl text-center">
        <div className="text-left">
          <VoltarLink href="/">Início</VoltarLink>
        </div>

        <p className="text-fluid-xs mb-3 font-medium tracking-[0.2em] text-acento-suave uppercase">
          Para Proprietários e Vendedores
        </p>
        <h1 className="text-fluid-3xl text-titulo">
          Venda ou alugue seu imóvel mais rápido com a Next Home.
        </h1>
        <p className="text-fluid-base mt-5 text-apoio">
          Conectamos seu imóvel a milhares de compradores e investidores em Alphaville, Barueri e região. Receba uma avaliação gratuita e comece a anunciar hoje mesmo.
        </p>
      </Reveal>

      <Reveal stagger={0.1} className="mx-auto mt-14 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {ETAPAS.map((etapa, i) => (
          <GlassSurface key={etapa.titulo} preset="painel" className="px-6 py-7">
            <span className="font-display text-fluid-xl text-acento-forte">{i + 1}</span>
            <h2 className="font-display mt-2 text-lg text-titulo">{etapa.titulo}</h2>
            <p className="text-fluid-sm mt-2 text-legenda">{etapa.texto}</p>
          </GlassSurface>
        ))}
      </Reveal>

      <div className="mx-auto mt-16 grid w-full max-w-4xl gap-8 lg:grid-cols-[1.1fr_1fr]">
        <Reveal className="rounded-2xl border border-linha bg-superficie/50 p-6 sm:p-8">
          <h2 className="font-display text-lg text-titulo">Cadastre seu Imóvel</h2>
          <p className="text-fluid-sm mt-1 mb-6 text-legenda">
            Rápido, sem compromisso e com avaliação de mercado gratuita.
          </p>
          <FormularioProprietario regioes={[...site.regioes]} />
        </Reveal>

        <Reveal delay={0.1} className="space-y-6">
          <div className="rounded-2xl border border-linha bg-superficie/50 p-6">
            <h2 className="font-display text-lg text-titulo">Prefere atendimento direto?</h2>
            <p className="text-fluid-sm mt-2 text-legenda">
              {corretorAtivo
                ? `Converse diretamente com ${corretorAtivo.nome} no WhatsApp.`
                : "Fale com nossos corretores no WhatsApp para tirar dúvidas e agendar uma avaliação."}
            </p>
            <WhatsappLink
              href={whatsapp}
              origem="anunciar_imovel"
              corretorId={corretorAtivo?.id}
              className="mt-5 inline-flex rounded-full bg-brand-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-400 shadow-md"
            >
              Falar no WhatsApp
            </WhatsappLink>
          </div>

          <div className="rounded-2xl border border-linha bg-superficie/50 p-6">
            <h2 className="font-display text-lg text-titulo">Por que anunciar com a Next Home</h2>
            <ul className="text-fluid-sm mt-3 space-y-2 text-legenda">
              <li className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-acento-suave shrink-0" />
                <span>Base ativa de compradores cadastrados na região.</span>
              </li>
              <li className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-acento-suave shrink-0" />
                <span>Divulgação destacada no Zap, VivaReal, OLX e Redes Sociais.</span>
              </li>
              <li className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-acento-suave shrink-0" />
                <span>Segurança jurídica completa e contratos sem burocracia.</span>
              </li>
              <li className="flex items-center gap-2">
                <Handshake className="w-4 h-4 text-acento-suave shrink-0" />
                <span>Acompanhamento dedicado de corretores especialistas.</span>
              </li>
            </ul>
            <p className="text-fluid-xs mt-4 text-tenue">CRECI {site.creci}</p>
          </div>
        </Reveal>
      </div>
    </main>
  );
}

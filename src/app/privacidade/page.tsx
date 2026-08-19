import type { Metadata } from "next";
import { GlassBackgroundProvider } from "@/components/glass/GlassBackground";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { VoltarLink } from "@/components/ui/VoltarLink";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como a Next Home trata os dados enviados pelo formulário de contato.",
};

export default function PrivacidadePage() {
  return (
    <GlassBackgroundProvider>
      <SiteHeader />
      <WhatsappCta />

      <main className="flex flex-1 flex-col bg-fundo px-4 pt-32 pb-24">
        <Reveal className="mx-auto w-full max-w-2xl">
          <VoltarLink href="/">Início</VoltarLink>

          <h1 className="text-fluid-2xl text-mist-50">Política de Privacidade</h1>
          <p className="text-fluid-sm mt-2 text-mist-500">
            Última atualização: {new Date().toLocaleDateString("pt-BR", { year: "numeric", month: "long" })}
          </p>

          <div className="text-fluid-base mt-8 space-y-6 text-apoio">
            <section>
              <h2 className="font-display text-lg text-titulo">Quais dados coletamos</h2>
              <p className="mt-2">
                Quando você envia o formulário de contato ou fala com um corretor, coletamos
                apenas o que você mesmo informa: nome, e-mail e/ou telefone, mensagem e,
                quando aplicável, o empreendimento de interesse. Não usamos cookies de
                rastreamento próprios além do necessário para o funcionamento do site.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg text-titulo">Para que usamos</h2>
              <p className="mt-2">
                Esses dados servem exclusivamente para que a {site.nomeCompleto} (CRECI{" "}
                {site.creci}) ou o corretor responsável pelo empreendimento entre em contato
                com você sobre o imóvel de interesse. Não vendemos nem compartilhamos seus
                dados com terceiros para fins de marketing.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg text-titulo">Base legal e retenção</h2>
              <p className="mt-2">
                O tratamento se baseia no seu consentimento explícito, dado no momento do
                envio do formulário, conforme a Lei Geral de Proteção de Dados (Lei nº
                13.709/2018). Os dados ficam armazenados enquanto forem necessários para o
                atendimento da sua solicitação, ou até você pedir a exclusão.
              </p>
            </section>

            <section>
              <h2 className="font-display text-lg text-titulo">Seus direitos</h2>
              <p className="mt-2">
                Você pode pedir a qualquer momento a confirmação, correção, portabilidade ou
                exclusão dos seus dados, ou revogar o consentimento — basta entrar em contato
                pelo WhatsApp ou pela página de{" "}
                <a href="/contato" className="text-acento underline-offset-4 hover:underline">
                  Contato
                </a>
                .
              </p>
            </section>
          </div>
        </Reveal>
      </main>
    </GlassBackgroundProvider>
  );
}

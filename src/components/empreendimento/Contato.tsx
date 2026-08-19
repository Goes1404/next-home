import Image from "next/image";
import Link from "next/link";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { Compartilhar } from "@/components/empreendimento/Compartilhar";
import { Reveal } from "@/components/motion/Reveal";
import { iniciais } from "@/lib/format";
import { linkWhatsappPara } from "@/lib/site";
import type { Empreendimento } from "@/lib/types";

export function Contato({ empreendimento: e }: { empreendimento: Empreendimento }) {
  const link = linkWhatsappPara(
    e.corretor.whatsapp,
    `Olá, ${e.corretor.nome}! Vim pelo site e quero receber a tabela de valores e condições do ${e.nome}.`,
  );

  return (
    <section id="contato" className="scroll-mt-24 bg-superficie/40 px-4 py-16 sm:py-24">
      <Reveal className="mx-auto max-w-xl text-center">
        <h2 className="text-fluid-2xl text-titulo">Quer saber valores e condições deste imóvel?</h2>
        <p className="text-fluid-base mt-3 text-apoio">
          Receba a tabela de preços atualizada, fluxo de pagamento e simulação de financiamento direto no WhatsApp.
        </p>

        <div className="mt-8 rounded-2xl border border-linha/10 bg-superficie px-6 py-7">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:text-left">
            {e.corretor.fotoUrl ? (
              <Image
                src={e.corretor.fotoUrl}
                alt=""
                width={72}
                height={72}
                className="h-18 w-18 shrink-0 rounded-full object-cover"
              />
            ) : (
              // `text-mist-50` literal, como o texto branco sobre botão da marca: as
              // iniciais vivem sobre um círculo de teal sólido, igual nos dois temas.
              <span
                aria-hidden
                className="font-display flex h-18 w-18 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl text-mist-50"
              >
                {iniciais(e.corretor.nome)}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="font-display text-lg text-titulo">{e.corretor.nome}</p>
              <p className="text-fluid-sm text-legenda">
                Corretor responsável · CRECI {e.corretor.creci}
              </p>
            </div>
          </div>

          <WhatsappLink
            href={link}
            origem="ficha_imovel"
            corretorId={e.corretor && "id" in e.corretor ? (e.corretor as { id: string }).id : undefined}
            empreendimentoSlug={e.slug}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-400 shadow-md"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
            </svg>
            Consultar Tabela e Condições no WhatsApp
          </WhatsappLink>

          <Link
            href={`/contato?empreendimento=${e.slug}`}
            className="text-fluid-sm mt-4 block text-legenda underline-offset-4 hover:text-acento hover:underline"
          >
            Prefere receber por e-mail? Preencha o formulário rápido.
          </Link>
        </div>

        <div className="mt-6 flex justify-center">
          <Compartilhar
            titulo={e.nome}
            texto={`${e.nome} — ${e.bairro}, ${e.cidade}`}
          />
        </div>
      </Reveal>
    </section>
  );
}

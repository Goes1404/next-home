import { Reveal } from "@/components/motion/Reveal";
import { linkWhatsappPara } from "@/lib/site";
import type { Empreendimento } from "@/lib/types";

export function Contato({ empreendimento: e }: { empreendimento: Empreendimento }) {
  const link = linkWhatsappPara(
    e.corretor.whatsapp,
    `Olá, ${e.corretor.nome}! Vim pelo site e quero saber mais sobre o ${e.nome}.`,
  );

  return (
    <section className="bg-ink-900/40 px-4 py-16 sm:py-24">
      <Reveal className="mx-auto max-w-xl text-center">
        <h2 className="text-fluid-2xl text-mist-50">Interessou?</h2>
        <p className="text-fluid-base mt-3 text-mist-300">
          Fale direto com {e.corretor.nome}, corretor responsável por{" "}
          {e.nome} — CRECI {e.corretor.creci}.
        </p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
        >
          Falar com {e.corretor.nome} no WhatsApp
        </a>
      </Reveal>
    </section>
  );
}

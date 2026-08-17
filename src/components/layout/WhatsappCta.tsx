import { GlassSurface } from "@/components/glass/GlassSurface";
import { linkWhatsapp, linkWhatsappPara } from "@/lib/site";

type WhatsappCtaProps = {
  empreendimento?: string;
  /** Quando informado, fala direto com o corretor responsável em vez da linha geral. */
  corretor?: { nome: string; whatsapp: string };
};

/**
 * CTA flutuante — fica acima da barra de navegação inferior no mobile
 * (reserva de `--nav-mobile-h`) e no canto inferior direito no desktop.
 *
 * Só o símbolo do WhatsApp, sem rótulo: o ícone já é universalmente
 * reconhecido e, redondo e compacto, para de cobrir o conteúdo por onde
 * flutua. Como não há texto visível, o destino vai no `aria-label` — é o
 * que leitor de tela e busca por voz anunciam.
 */
export function WhatsappCta({ empreendimento, corretor }: WhatsappCtaProps) {
  const link = corretor
    ? linkWhatsappPara(
        corretor.whatsapp,
        `Olá, ${corretor.nome}! Vim pelo site${empreendimento ? ` e quero saber mais sobre o ${empreendimento}` : ""}.`,
      )
    : linkWhatsapp(empreendimento);

  const rotulo = corretor
    ? `Falar com ${corretor.nome} no WhatsApp`
    : "Falar no WhatsApp";

  return (
    <div className="pb-safe fixed right-4 bottom-[calc(var(--nav-mobile-h)+1rem)] z-40 sm:bottom-6">
      <GlassSurface preset="pill" tint={0.2} intensity={1.2}>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={rotulo}
          title={rotulo}
          className="flex h-14 w-14 items-center justify-center text-mist-50"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-7 w-7 text-brand-200">
            <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
          </svg>
        </a>
      </GlassSurface>
    </div>
  );
}

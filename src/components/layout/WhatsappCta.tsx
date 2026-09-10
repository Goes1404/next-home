import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { FlutuanteVisivel } from "@/components/layout/FlutuanteVisivel";
import { linkWhatsapp, linkWhatsappPara } from "@/lib/site";

type WhatsappCtaProps = {
  empreendimento?: string;
  /** Quando informado, fala direto com o corretor responsável em vez da linha geral. */
  corretor?: { nome: string; whatsapp: string; id?: string };
};

/**
 * CTA flutuante — canto inferior direito, acima da área segura do celular.
 *
 * ## O que mudou em 10/09/2026
 *
 * Era um disco de vidro translúcido com o símbolo na cor do tema: sobre
 * foto clara ele virava um borrão, sobre texto ele parecia parte do texto.
 * Virou o verde da marca, sólido, com o símbolo branco — o que qualquer
 * pessoa reconhece como "o botão do WhatsApp" antes de ler nada — e um
 * anel claro para não se fundir com fundo escuro. Sem pulso: movimento em
 * repouso compete com o conteúdo (régua de 07/09).
 *
 * Quando ele aparece é decisão de `FlutuanteVisivel`: some ao rolar para
 * baixo, sobre o rodapé e com o teclado aberto, que é onde ele cobria o que
 * importa. Fica abaixo do header (z-30 contra z-40) e do menu (z-50): nunca
 * flutua por cima de navegação.
 *
 * Só o símbolo, sem rótulo: o destino vai no `aria-label`, que é o que
 * leitor de tela e busca por voz anunciam.
 */
export function WhatsappCta({ empreendimento, corretor }: WhatsappCtaProps) {
  const link = corretor
    ? linkWhatsappPara(
        corretor.whatsapp,
        `Olá, ${corretor.nome}! Vim pelo site${empreendimento ? ` e quero saber mais sobre o ${empreendimento}` : ""}.`,
      )
    : linkWhatsapp(empreendimento);

  const rotulo = corretor ? `Falar com ${corretor.nome} no WhatsApp` : "Falar no WhatsApp";

  return (
    <FlutuanteVisivel>
      <WhatsappLink
        href={link}
        origem="botao_flutuante"
        corretorId={corretor?.id}
        empreendimentoSlug={empreendimento}
        aria-label={rotulo}
        title={rotulo}
        // Cores literais de propósito: é o verde do WhatsApp/da marca com
        // símbolo branco nos dois temas — o botão não segue o tema, é
        // reconhecido pela cor.
        className="bg-brand-500 hover:bg-brand-400 active:bg-brand-600 flex size-14 items-center justify-center rounded-full text-white shadow-[0_12px_32px_-10px_rgb(0_0_0/0.65)] ring-1 ring-white/25 transition-[background-color,transform] duration-200 active:scale-95 motion-reduce:transition-none"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-7">
          <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
        </svg>
      </WhatsappLink>
    </FlutuanteVisivel>
  );
}

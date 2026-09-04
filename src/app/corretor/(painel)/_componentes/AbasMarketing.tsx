import { AbasSecao } from "./AbasSecao";
import { subitensDe } from "./navegacao";

/**
 * Tudo que vira post, story, anúncio ou disparo.
 *
 * Nasceu em 04/09/2026 para dar às telas de Marketing a mesma barra que as
 * outras seções já tinham. Antes: Campanhas e Modelos desenhavam abas de
 * WhatsApp (embora o menu as acendesse em Marketing), e o hub, o vídeo, a
 * arte e os links não tinham barra nenhuma — `/corretor/links` chegou a não
 * ter item de menu NEM aba, a única tela do painel sem pai.
 *
 * A ordem é a de uso, e é a mesma do sidebar: arte e vídeo primeiro, que é o
 * que se faz; disparo depois, que é o passo seguinte à peça pronta.
 */
export function AbasMarketing({ ativa, naFila }: { ativa: string; naFila?: number }) {
  const abas = subitensDe("/corretor/marketing").map((sub) => ({
    href: sub.href,
    label: sub.label,
    /** Mensagens de campanha ainda por enviar. */
    contador: sub.href === "/corretor/campanhas" ? naFila : undefined,
  }));

  return <AbasSecao abas={abas} ativa={ativa} rotulo="Seções do marketing" />;
}

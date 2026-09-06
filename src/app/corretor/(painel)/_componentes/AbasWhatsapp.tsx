import { AbasSecao } from "./AbasSecao";
import { subitensDe } from "./navegacao";

/**
 * O canal: quem falou com o número e como a IA está atendendo.
 *
 * Em 04/09/2026 esta barra perdeu duas abas para Marketing — Listas de
 * transmissão e Modelos. Elas eram absorvidas por Marketing no MENU e
 * desenhadas aqui na TELA, então o sidebar acendia magenta enquanto a página
 * dizia WhatsApp. Disparo é peça de saída; conversa é atendimento.
 *
 * A ordem é a do uso: conversa acontece o dia inteiro, ajuste de IA quase
 * nunca. Ela vive em `navegacao.tsx`, junto com o resto da hierarquia.
 */
export function AbasWhatsapp({
  ativa,
  semRevisao,
  conectado,
}: {
  ativa: string;
  /** Respostas da IA esperando 👍/👎 — o rótulo que alimenta o aprendizado. */
  semRevisao?: number;
  /** Número pareado? A bolinha responde antes de o corretor abrir a aba. */
  conectado?: boolean;
}) {
  const abas = subitensDe("/corretor/whatsapp").map((sub) => ({
    href: sub.href,
    label: sub.label,
    contador: sub.href === "/corretor/conversas" ? semRevisao : undefined,
    // `undefined` enquanto não se sabe: pintar de vermelho um estado que
    // ninguém consultou seria inventar um problema.
    ponto:
      sub.href !== "/corretor/whatsapp" || conectado === undefined
        ? undefined
        : ((conectado ? "ok" : "perigo") as "ok" | "perigo"),
  }));

  return <AbasSecao abas={abas} ativa={ativa} rotulo="Seções do WhatsApp" />;
}

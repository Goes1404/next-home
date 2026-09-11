import { AbasSecao } from "./AbasSecao";
import { subitensDe } from "./navegacao";

/**
 * A assistente: como ela atende, o que ela respondeu, e o que ela GERA.
 *
 * Em 04/09/2026 esta barra perdeu duas abas para Marketing — Listas de
 * transmissão e Modelos. Elas eram absorvidas por Marketing no MENU e
 * desenhadas aqui na TELA, então o sidebar acendia magenta enquanto a página
 * dizia WhatsApp. Disparo é peça de saída; conversa é atendimento.
 *
 * Em 11/09/2026 ganhou Criar arte e Criar vídeo, que vinham de Marketing:
 * quem gera a peça é a mesma IA, e é aqui que o corretor a procura. As duas
 * telas continuam nas rotas antigas — nenhum link salvo quebra.
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

import { AbasSecao } from "./AbasSecao";

/**
 * Tudo que acontece no WhatsApp, num destino só.
 *
 * Eram três itens de menu — Conversas, Campanhas e "IA & WhatsApp" — e os
 * três falam do mesmo número, do mesmo cliente e da mesma IA. Separados, o
 * corretor precisava saber de antemão em qual deles estava o que procurava;
 * juntos, ele entra em WhatsApp e escolhe.
 *
 * A ordem é a do uso: conversa acontece o dia inteiro, campanha de vez em
 * quando, ajuste de IA quase nunca.
 */
const ABAS = [
  { chave: "conversas", href: "/corretor/conversas", label: "Conversas" },
  { chave: "campanhas", href: "/corretor/campanhas", label: "Campanhas" },
  { chave: "ia", href: "/corretor/whatsapp", label: "Minha IA" },
] as const;

export type AbaWhatsapp = (typeof ABAS)[number]["chave"];

export function AbasWhatsapp({
  ativa,
  semRevisao,
  naFila,
  conectado,
}: {
  ativa: AbaWhatsapp;
  /** Respostas da IA esperando 👍/👎 — o rótulo que alimenta o aprendizado. */
  semRevisao?: number;
  /** Mensagens de campanha ainda por enviar. */
  naFila?: number;
  /** Número pareado? A bolinha responde antes de o corretor abrir a aba. */
  conectado?: boolean;
}) {
  const abas = [
    { href: ABAS[0].href, label: ABAS[0].label, contador: semRevisao },
    { href: ABAS[1].href, label: ABAS[1].label, contador: naFila },
    {
      href: ABAS[2].href,
      label: ABAS[2].label,
      // `undefined` enquanto não se sabe: pintar de vermelho um estado que
      // ninguém consultou seria inventar um problema.
      ponto:
        conectado === undefined ? undefined : ((conectado ? "ok" : "perigo") as "ok" | "perigo"),
    },
  ];

  const ativaHref = ABAS.find((a) => a.chave === ativa)?.href ?? ABAS[0].href;

  return <AbasSecao abas={abas} ativa={ativaHref} rotulo="Seções do WhatsApp" />;
}

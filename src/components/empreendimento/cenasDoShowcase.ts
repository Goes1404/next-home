import type { Empreendimento, Midia } from "@/lib/types";

export type Cena = { foto: Midia; frase: string; rotulo: string };

/**
 * As frases saem do que o imóvel TEM cadastrado — nada inventado. Cada uma
 * ganha a foto seguinte da galeria (a capa já dominou o hero).
 *
 * Roda no SERVIDOR (é pura): a `CenaShowcase` recebia o `Empreendimento`
 * inteiro só para escolher três fotos e três frases, e tudo o que um client
 * component recebe viaja no HTML. Aqui viajam três cenas.
 */
export function cenasDoShowcase(e: Empreendimento): Cena[] {
  const fotos = e.galeria.filter((f) => f.url !== e.capa.url).slice(0, 3);
  if (fotos.length < 3) return [];

  const frases: Array<{ frase: string; rotulo: string }> = [
    { frase: e.tagline, rotulo: "O projeto" },
  ];
  if (e.lazer.length >= 3) {
    frases.push({
      frase: `${e.lazer.slice(0, 3).join(", ")} — e mais ${Math.max(e.lazer.length - 3, 0) || "outros"} itens de lazer.`,
      rotulo: "Viver bem",
    });
  } else {
    frases.push({ frase: `${e.bairro}, ${e.cidade}.`, rotulo: "O endereço" });
  }
  frases.push({
    frase: e.construtora ? `Assinado por ${e.construtora}.` : `${e.bairro}, ${e.cidade}.`,
    rotulo: "A entrega",
  });

  return fotos.map((foto, i) => ({ foto, ...frases[i] }));
}

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
/**
 * A foto da seção "Sobre": a primeira da galeria que não é a capa (a capa
 * domina o hero). Mora aqui porque a vitrine de cenas precisa PULAR esta
 * mesma foto — sem isso, no celular, a fachada aparecia duas vezes seguidas
 * (o Sobre e logo abaixo a primeira cena; relato de 13/10/2026).
 */
export function fotoDoSobre(e: Empreendimento): Midia | null {
  return e.galeria.find((f) => f.url !== e.capa.url) ?? e.galeria[0] ?? null;
}

export function cenasDoShowcase(e: Empreendimento): Cena[] {
  const doSobre = fotoDoSobre(e)?.url;
  const fotos = e.galeria
    .filter((f) => f.url !== e.capa.url && f.url !== doSobre)
    .slice(0, 3);
  if (fotos.length < 3) return [];

  const frases: Array<{ frase: string; rotulo: string }> = [
    e.tagline
      ? { frase: e.tagline, rotulo: "O projeto" }
      : { frase: `${e.nome}, ${e.bairro}.`, rotulo: "O projeto" },
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

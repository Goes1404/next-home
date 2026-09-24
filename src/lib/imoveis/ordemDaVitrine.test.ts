import { describe, expect, it } from "vitest";
import { ordenar } from "@/lib/queries";
import type { Empreendimento } from "@/lib/types";
import { alternarDestaque, mover, ordemDoSite, paraGravar, podeMover } from "./ordemDaVitrine";

const item = (slug: string, destaque = false) => ({ slug, nome: slug, destaque });
const slugs = (l: { slug: string }[]) => l.map((i) => i.slug);

describe("ordem do site no painel", () => {
  it("põe os destaques primeiro e preserva a ordem do banco dentro de cada grupo", () => {
    const lista = ordemDoSite([item("a"), item("b", true), item("c"), item("d", true)]);
    expect(slugs(lista)).toEqual(["b", "d", "a", "c"]);
  });

  it("concorda com a ordenação que o site aplica", () => {
    const entrada = [item("a"), item("b", true), item("c"), item("d", true)];
    const doSite = ordenar(entrada as unknown as Empreendimento[], "destaque");
    expect(slugs(ordemDoSite(entrada))).toEqual(slugs(doSite));
  });

  it("move dentro do grupo, mas não atravessa a fronteira do destaque", () => {
    const lista = [item("b", true), item("d", true), item("a"), item("c")];
    expect(slugs(mover(lista, 3, -1))).toEqual(["b", "d", "c", "a"]);
    expect(podeMover(lista, 2, -1)).toBe(false);
    expect(mover(lista, 2, -1)).toBe(lista);
    expect(podeMover(lista, 0, -1)).toBe(false);
    expect(podeMover(lista, 3, 1)).toBe(false);
  });

  it("marcar destaque leva ao fim dos destaques; desmarcar, ao começo dos demais", () => {
    const lista = [item("b", true), item("d", true), item("a"), item("c")];
    const marcado = alternarDestaque(lista, "c");
    expect(slugs(marcado)).toEqual(["b", "d", "c", "a"]);
    expect(marcado[2].destaque).toBe(true);

    const desmarcado = alternarDestaque(lista, "b");
    expect(slugs(desmarcado)).toEqual(["d", "b", "a", "c"]);
    expect(desmarcado[1].destaque).toBe(false);
  });

  it("grava a posição da tela, com folga entre os números", () => {
    expect(paraGravar([item("x", true), item("y")])).toEqual([
      { slug: "x", ordem: 10, destaque: true },
      { slug: "y", ordem: 20, destaque: false },
    ]);
  });
});

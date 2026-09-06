import { describe, expect, it } from "vitest";
import { classificacaoDeReserva } from "./classificarFotos";
import { montarRoteiro } from "./roteiro";
import type { Midia } from "@/lib/types";

describe("classificacaoDeReserva", () => {
  it("nunca devolve tudo do mesmo tipo — é isso que ela existe para evitar", () => {
    // Sem classificação, `tipoDoPlano` cai em "interior" para tudo, todo plano
    // vira PUSH e a gramática deixa de funcionar. A reserva imperfeita ainda
    // dá variedade.
    for (const n of [2, 4, 5, 8]) {
      expect(new Set(classificacaoDeReserva(n)).size, `${n} fotos`).toBeGreaterThan(1);
    }
  });

  it("abre por fachada: é o que o corretor põe primeiro na maioria dos casos", () => {
    expect(classificacaoDeReserva(5)[0]).toBe("fachada");
  });

  it("uma foto só não quebra", () => {
    expect(classificacaoDeReserva(1)).toEqual(["fachada"]);
    expect(classificacaoDeReserva(0)).toEqual([]);
  });
});

describe("o roteiro com fotos classificadas", () => {
  it("o tipo classificado vira o movimento, sem depender de alt escrito", () => {
    // Este é o elo que faz o upload funcionar: a classificação entra como
    // `alt` sintético, e a gramática segue exatamente como no catálogo.
    const tipos = classificacaoDeReserva(4);
    const fotos: Midia[] = tipos.map((t, i) => ({
      tipo: "foto",
      url: `https://x/${i}.jpg`,
      alt: t === "fachada" ? "Fachada do prédio" : t === "lazer" ? "Piscina do condomínio" : "Living integrado",
      largura: 1000,
      altura: 512,
      blurDataUrl: null,
    }));
    const planos = montarRoteiro({ fotos, objetivo: "lancamento" });
    expect(planos.length).toBe(4);
    expect(new Set(planos.map((p) => p.movimento)).size).toBeGreaterThan(1);
  });
});

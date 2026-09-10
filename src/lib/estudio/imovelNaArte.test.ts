import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { fatosDoImovelCitado } from "./imovelNaArte";

function imovel(extra: Partial<Empreendimento> = {}): Empreendimento {
  return {
    slug: "dom-parque",
    nome: "Dom Parque",
    status: "em_construcao",
    cidade: "Barueri",
    bairro: "Aldeia",
    construtora: "P4 Engenharia",
    tipologias: [],
    lazer: [],
    ...extra,
  } as unknown as Empreendimento;
}

describe("o imóvel citado vira fatos para o prompt", () => {
  it("leva nome, local, estágio e construtora", () => {
    const fatos = fatosDoImovelCitado(imovel());
    const texto = fatos.join(" | ");
    expect(texto).toContain("Dom Parque");
    expect(texto).toContain("Aldeia");
    expect(texto).toContain("Em construção");
    expect(texto).toContain("P4 Engenharia");
  });

  it("converte tipologia para o recorte que o prompt usa", () => {
    const fatos = fatosDoImovelCitado(
      imovel({
        tipologias: [
          { nome: "2 dorm", areaPrivativa: 63, dormitorios: 2, suites: 1, banheiros: 2, vagas: 1, preco: null, plantaUrl: null, unidadesDisponiveis: null },
        ],
      }),
    );
    const tip = fatos.find((f) => f.startsWith("Tipologias:"));
    expect(tip).toContain("63 m²");
    expect(tip).toContain("2 dorm");
    expect(tip).toContain("1 vaga");
  });

  it("leva o lazer que EXISTE", () => {
    const fatos = fatosDoImovelCitado(imovel({ lazer: ["Piscina", "Academia"] }));
    expect(fatos.join(" ")).toContain("Piscina");
  });

  it("cadastro com nome vazio não vira fato — a régua de campo vazio vale aqui também", () => {
    const fatos = fatosDoImovelCitado(imovel({ nome: "." }));
    expect(fatos.some((f) => f.startsWith("Empreendimento:"))).toBe(false);
  });
});

describe("as fotos candidatas", () => {
  it("devolve até 8, e só as do tipo foto", async () => {
    const { fotosParaReferencia } = await import("./imovelNaArte");
    const midias = Array.from({ length: 12 }, (_, i) => ({
      url: `https://x/${i}.jpg`,
      alt: `foto ${i}`,
      tipo: i === 0 ? "planta" : "foto",
    }));
    const fotos = fotosParaReferencia(imovel({ midias } as never));
    expect(fotos.length).toBe(8);
    expect(fotos.every((f) => !f.url.endsWith("/0.jpg"))).toBe(true);
  });

  it("imóvel sem mídia devolve lista vazia, nunca undefined", async () => {
    const { fotosParaReferencia } = await import("./imovelNaArte");
    expect(fotosParaReferencia(imovel())).toEqual([]);
  });
});

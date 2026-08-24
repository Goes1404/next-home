import { describe, expect, it } from "vitest";
import { fotosDoLazer, pontuarFoto } from "./lazerFotos";
import type { Midia } from "@/lib/types";

function foto(alt: string, url = alt): Midia {
  return { tipo: "foto", url, alt, largura: 0, altura: 0, blurDataUrl: null };
}

/**
 * Os alts usados aqui são os REAIS de produção (Viva RSF Vila do Conde), e o
 * caso do "Estação 267" é o padrão dos outros 25 imóveis: alt igual ao nome
 * do empreendimento, que não pode casar com nada.
 */
describe("pontuarFoto", () => {
  it("casa item com a foto que o descreve", () => {
    expect(pontuarFoto("Academia", "Academia equipada com parede verde e esteiras")).toBeGreaterThan(0);
    expect(pontuarFoto("Coworking", "Espaço de coworking com mesas comunitárias e poltronas")).toBeGreaterThan(0);
  });

  it("não casa com alt que é só o nome do empreendimento", () => {
    expect(pontuarFoto("Piscina", "Estação 267")).toBe(0);
    expect(pontuarFoto("Academia", "Bosque AlphaGran")).toBe(0);
  });

  it("ignora acento e caixa", () => {
    expect(pontuarFoto("Espaço Pet", "espaco pet place com brinquedos")).toBeGreaterThan(0);
  });

  it("exige o substantivo principal, não uma palavra qualquer em comum", () => {
    // Sem a trava do token principal, "espaço" casaria as duas coisas e o
    // cliente veria cachorro ao tocar em "Espaço Gourmet".
    expect(pontuarFoto("Espaço Gourmet", "Espaço pet place com brinquedos e obstáculos para cães")).toBe(0);
  });

  it("prefere a foto que contém a frase inteira do item", () => {
    const especifica = pontuarFoto("Piscina adulto", "Piscina adulto com deck e espreguiçadeiras");
    const generica = pontuarFoto("Piscina adulto", "Piscina infantil com prainha");
    expect(especifica).toBeGreaterThan(generica);
  });

  it("não casa por palavra curta ou preposição", () => {
    expect(pontuarFoto("Área de Serviço", "Vista aérea da fachada e área de lazer à noite")).toBe(0);
  });
});

describe("fotosDoLazer", () => {
  const fotos = [
    foto("Academia equipada com parede verde e esteiras"),
    foto("Espaço de coworking com mesas comunitárias e poltronas"),
    foto("Piscina adulto com deck e espreguiçadeiras entre os prédios"),
    foto("Vista aérea da fachada e área de lazer à noite"),
  ];

  it("mapeia só os itens que têm foto de verdade", () => {
    const mapa = fotosDoLazer(["Academia", "Coworking", "Churrasqueira", "Cinema"], fotos);
    expect(mapa.get("Academia")?.alt).toContain("Academia");
    expect(mapa.get("Coworking")?.alt).toContain("coworking");
    expect(mapa.has("Churrasqueira")).toBe(false);
    expect(mapa.has("Cinema")).toBe(false);
  });

  it("deixa o mapa vazio quando nenhum alt é descritivo", () => {
    const semAlt = [foto("Estação 267"), foto("Estação 267", "b"), foto("Estação 267", "c")];
    expect(fotosDoLazer(["Piscina", "Academia", "Elevador"], semAlt).size).toBe(0);
  });

  it("deixa a mesma foto servir a dois itens parecidos", () => {
    const mapa = fotosDoLazer(["Piscina", "Piscina adulto"], fotos);
    expect(mapa.get("Piscina")?.url).toBe(mapa.get("Piscina adulto")?.url);
  });
});

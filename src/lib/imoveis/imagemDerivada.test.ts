import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { gerarBlur, gerarPreview, medirImagem } from "./imagemDerivada";

function imagemLisa(largura: number, altura: number, cor: { r: number; g: number; b: number }) {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: cor } })
    .jpeg()
    .toBuffer();
}

describe("medirImagem", () => {
  it("devolve as medidas reais do arquivo", async () => {
    const medida = await medirImagem(await imagemLisa(800, 533, { r: 10, g: 90, b: 160 }));
    expect(medida).toEqual({ largura: 800, altura: 533 });
  });

  it("devolve null para bytes que não são imagem, sem lançar", async () => {
    expect(await medirImagem(Buffer.from("nada disso"))).toBeNull();
  });
});

describe("gerarBlur", () => {
  it("devolve um data URL de WebP minúsculo", async () => {
    const blur = await gerarBlur(await imagemLisa(1600, 900, { r: 10, g: 90, b: 160 }));

    expect(blur).toMatch(/^data:image\/webp;base64,/);
    // O placeholder viaja em TODA página de vitrine: precisa ser pequeno.
    expect(blur!.length).toBeLessThan(2000);
  });

  it("devolve null em vez de lançar quando os bytes não são imagem", async () => {
    expect(await gerarBlur(Buffer.from("nada disso"))).toBeNull();
  });
});

describe("gerarPreview", () => {
  it("acha que imagem clara e sem cor é planta", async () => {
    const previa = await gerarPreview(await imagemLisa(1200, 900, { r: 246, g: 246, b: 244 }));
    expect(previa!.parecePlanta).toBe(true);
  });

  it("não acha que foto colorida é planta", async () => {
    const previa = await gerarPreview(await imagemLisa(1200, 900, { r: 30, g: 110, b: 180 }));
    expect(previa!.parecePlanta).toBe(false);
  });
});

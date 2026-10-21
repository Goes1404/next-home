import { describe, expect, it } from "vitest";
import {
  REDUCAO_DA_CAPA,
  REDUCAO_DA_LOGO,
  TENTATIVAS,
  dimensoesReduzidas,
  ehHeic,
  ehTipoAceito,
  nomeDoArquivoReduzido,
  tipoDeSaida,
} from "./reduzir";

describe("dimensoesReduzidas", () => {
  it("foto de celular na horizontal: o lado maior vira o teto, a proporção fica", () => {
    expect(dimensoesReduzidas(4032, 3024, 2400)).toEqual({ largura: 2400, altura: 1800, reduziu: true });
  });
  it("na vertical, o lado maior é a altura", () => {
    expect(dimensoesReduzidas(3024, 4032, 2400)).toEqual({ largura: 1800, altura: 2400, reduziu: true });
  });
  it("logo grande desce para 800", () => {
    expect(dimensoesReduzidas(2000, 500, 800)).toEqual({ largura: 800, altura: 200, reduziu: true });
  });
  it("imagem que já cabe não muda e nunca é ampliada", () => {
    expect(dimensoesReduzidas(800, 600, 2400)).toEqual({ largura: 800, altura: 600, reduziu: false });
    expect(dimensoesReduzidas(2400, 1000, 2400)).toEqual({ largura: 2400, altura: 1000, reduziu: false });
  });
  it("lado nunca vira zero e medida inválida é devolvida como veio", () => {
    expect(dimensoesReduzidas(10000, 1, 2400).altura).toBe(1);
    expect(dimensoesReduzidas(0, 0, 2400)).toEqual({ largura: 0, altura: 0, reduziu: false });
  });
});

describe("formato e nome", () => {
  it("PNG continua PNG (logo com transparência), WebP continua WebP e o resto vira JPEG", () => {
    expect(tipoDeSaida("image/png")).toBe("image/png");
    expect(tipoDeSaida("image/webp")).toBe("image/webp");
    expect(tipoDeSaida("image/jpeg")).toBe("image/jpeg");
    expect(tipoDeSaida("image/heic")).toBe("image/jpeg");
    expect(tipoDeSaida("")).toBe("image/jpeg");
  });
  it("conhece os três tipos que o servidor aceita", () => {
    expect(["image/png", "image/jpeg", "image/webp"].every(ehTipoAceito)).toBe(true);
    expect(ehTipoAceito("image/heic")).toBe(false);
    expect(ehTipoAceito("image/gif")).toBe(false);
  });
  it("reconhece HEIC pelo tipo ou pela extensão", () => {
    expect(ehHeic({ name: "IMG_1.HEIC", type: "" })).toBe(true);
    expect(ehHeic({ name: "x.jpg", type: "image/heif" })).toBe(true);
    expect(ehHeic({ name: "x.jpg", type: "image/jpeg" })).toBe(false);
  });
  it("o nome sai com a extensão do tipo que saiu", () => {
    expect(nomeDoArquivoReduzido("Foto da casa.HEIC", "image/jpeg")).toBe("Foto da casa.jpg");
    expect(nomeDoArquivoReduzido("logo.png", "image/webp")).toBe("logo.webp");
    expect(nomeDoArquivoReduzido("", "image/png")).toBe("imagem.png");
  });
});

describe("limites", () => {
  it("a capa cabe nos 4,5 MB de corpo da Vercel e nos 5 MB do servidor; a logo, no 1 MB do servidor", () => {
    expect(REDUCAO_DA_CAPA).toEqual({ ladoMaior: 2400, tetoBytes: 4 * 1024 * 1024 });
    expect(REDUCAO_DA_CAPA.tetoBytes).toBeLessThan(4.5 * 1024 * 1024);
    expect(REDUCAO_DA_LOGO).toEqual({ ladoMaior: 800, tetoBytes: 1024 * 1024 });
  });
  it("as tentativas só pioram: qualidade e escala nunca sobem", () => {
    for (let i = 1; i < TENTATIVAS.length; i += 1) {
      expect(TENTATIVAS[i].qualidade).toBeLessThanOrEqual(TENTATIVAS[i - 1].qualidade);
      expect(TENTATIVAS[i].escala).toBeLessThan(TENTATIVAS[i - 1].escala);
    }
    expect(TENTATIVAS[0].escala).toBe(1);
  });
});

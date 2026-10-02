import { describe, expect, it } from "vitest";
import { separarFrasesColadas, textoDoCadastro } from "./textoDoCadastro";

describe("separarFrasesColadas", () => {
  it("separa frases que o import colou", () => {
    expect(separarFrasesColadas("em Osasco!Descubra o lar")).toBe("em Osasco!\n\nDescubra o lar");
    expect(separarFrasesColadas("em Barueri.Apresentamos")).toBe("em Barueri.\n\nApresentamos");
    expect(separarFrasesColadas("Características:Academia, Piscina")).toBe(
      "Características: Academia, Piscina",
    );
    expect(separarFrasesColadas("a excelência,cada instante")).toBe("a excelência, cada instante");
  });

  it("não quebra abreviação, número nem hora", () => {
    for (const t of ["Jd.Esperança", "Av.Paulista", "R$ 289.000", "52,39 m²", "às 10:30", "AlphaGran"]) {
      expect(separarFrasesColadas(t)).toBe(t);
    }
  });
});

describe("textoDoCadastro", () => {
  it("frase igual ao primeiro parágrafo fica como título e sai da descrição", () => {
    const r = textoDoCadastro(
      "Breeze Home Clube",
      "Pé na areia em Barueri",
      "Pé na areia em Barueri\n\nLocalizado no Jardim Júlio.",
    );
    expect(r.tagline).toBe("Pé na areia em Barueri");
    expect(r.descricao).toBe("Localizado no Jardim Júlio.");
  });

  it("frase que é o começo cortado da descrição não vira título", () => {
    const descricao = "Viva com Estilo no Viva Jaguaribe, em Osasco!Descubra o seu novo lar no coração do Jaguaribe.";
    const r = textoDoCadastro("Viva Jaguaribe", descricao.slice(0, 60), descricao);
    expect(r.tagline).toBe("");
    expect(r.descricao).toBe("Viva com Estilo no Viva Jaguaribe, em Osasco!\n\nDescubra o seu novo lar no coração do Jaguaribe.");
  });

  it("frase que só repete o nome some", () => {
    expect(textoDoCadastro("Bosque AlphaGran", "Bosque AlphaGran", "Texto.").tagline).toBe("");
    expect(textoDoCadastro("Bless Parque", "Bless Parque Barueri", "Texto.").tagline).toBe("");
    expect(textoDoCadastro("Breeze Home Clube", "Lançamento em Barueri Breeze Home Clube", "Texto.").tagline).toBe("");
    // Frase que só passa pelo nome, mas diz outra coisa, fica.
    expect(
      textoDoCadastro("Joy Barueri", "Apartamentos de 65 m² a 167 m², com opções duplex", "Texto.").tagline,
    ).not.toBe("");
  });

  it("frase boa continua título quando a descrição fala de outra coisa", () => {
    const r = textoDoCadastro("NID Alphaville", "Refúgio urbano com lazer de clube", "O NID fica em Alphaville.");
    expect(r.tagline).toBe("Refúgio urbano com lazer de clube");
    expect(r.descricao).toBe("O NID fica em Alphaville.");
  });

  it("descrição de um parágrafo igual à frase não é esvaziada: a frase é que sai", () => {
    const r = textoDoCadastro("X", "Lazer de clube", "Lazer de clube");
    expect(r.tagline).toBe("");
    expect(r.descricao).toBe("Lazer de clube");
  });

  it("frase longa demais não é título", () => {
    expect(textoDoCadastro("X", "a".repeat(121), "Outra coisa.").tagline).toBe("");
  });
});

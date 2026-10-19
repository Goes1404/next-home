import { describe, expect, it } from "vitest";
import { corrigirNomeDoCorretor, primeiroNomeDoCorretor } from "./nomeDoCorretor";

describe("o nome do corretor é o do cadastro (conversa da Rute, 15/10/2026)", () => {
  it("troca o nome inventado pelo primeiro nome do corretor", () => {
    const r = corrigirNomeDoCorretor(
      "Você vai falar com o corretor Carlos, que vai te receber e apresentar tudo.",
      "Carolini Ivina Maia",
    );
    expect(r.corrigiu).toBe(true);
    expect(r.texto).toBe("Você vai falar com o corretor Carolini, que vai te receber e apresentar tudo.");
  });

  it("aceita o nome do cadastro, o sobrenome e o apelido", () => {
    for (const t of ["a corretora Carolini vai te receber", "com a corretora Carolini Maia", "a corretora Carol te recebe"]) {
      expect(corrigirNomeDoCorretor(t, "Carolini Ivina Maia").corrigiu, t).toBe(false);
    }
  });

  it("leva o sobrenome inventado junto", () => {
    expect(corrigirNomeDoCorretor("o corretor Carlos Silva te recebe", "Carolini Ivina Maia").texto).toBe(
      "o corretor Carolini te recebe",
    );
  });

  it("não mexe em 'corretor' sem nome nem em nome solto da frase", () => {
    const t = "Oi Rute! O corretor responsável vai te receber.";
    expect(corrigirNomeDoCorretor(t, "Carolini Ivina Maia")).toEqual({ texto: t, corrigiu: false });
  });

  it("vale para qualquer corretor: o nome vem do cadastro de quem atende", () => {
    for (const [cadastro, primeiro] of [
      ["Bruna Souza", "Bruna"],
      ["Ramos Oliveira", "Ramos"],
      ["Márcia Lima", "Márcia"],
    ]) {
      expect(corrigirNomeDoCorretor("a corretora Carla vai te receber", cadastro).texto).toBe(
        `a corretora ${primeiro} vai te receber`,
      );
    }
  });

  it("sem nome cadastrado, não mexe", () => {
    expect(corrigirNomeDoCorretor("o corretor Carlos", null).corrigiu).toBe(false);
    expect(primeiroNomeDoCorretor("  ")).toBeNull();
  });
});

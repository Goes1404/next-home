import { describe, expect, it } from "vitest";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "./actionDeOutroBuild";

describe("ehActionDeOutroBuild", () => {
  /*
   * A mensagem literal que o servidor de dev imprimiu em 11/09/2026, quando
   * um `npm run build` trocou os IDs debaixo de uma aba aberta. Ela virou
   * 404 no POST da rota da página e, no cliente, "Sem conexão".
   */
  it("reconhece a mensagem real do Next", () => {
    const real = new Error(
      'Failed to find Server Action "4001bb7583c2e3104c185d0f4791a88a707fcc2ce1". ' +
        "This request might be from an older or newer deployment.",
    );
    expect(ehActionDeOutroBuild(real)).toBe(true);
  });

  it("reconhece as variações de redação", () => {
    expect(ehActionDeOutroBuild(new Error("This request might be from an older or newer deployment."))).toBe(true);
    expect(ehActionDeOutroBuild(new Error("An unexpected response was received from the server."))).toBe(true);
    expect(ehActionDeOutroBuild("FAILED TO FIND SERVER ACTION x")).toBe(true);
  });

  /*
   * O erro de rede de verdade tem de continuar caindo na mensagem de rede:
   * confundir os dois inverteria o defeito em vez de corrigi-lo.
   */
  it("não confunde com falha de rede nem com erro de negócio", () => {
    for (const outro of [
      new Error("TypeError: fetch failed"),
      new Error("NetworkError when attempting to fetch resource."),
      new Error("Limite de hoje atingido."),
      new Error(""),
      null,
      undefined,
      42,
    ]) {
      expect(ehActionDeOutroBuild(outro), String(outro)).toBe(false);
    }
  });
});

describe("avisoDePaginaVelha", () => {
  it("diz que tentar de novo não resolve e qual é o gesto que resolve", () => {
    const texto = avisoDePaginaVelha();
    expect(texto).toMatch(/Recarregue a página/);
    expect(texto).toMatch(/mesmo erro/);
  });

  it("carrega o que já foi salvo, para ninguém pagar duas vezes pela mesma arte", () => {
    const texto = avisoDePaginaVelha("A imagem FOI gerada e já está na sua galeria.");
    expect(texto).toMatch(/já está na sua galeria/);
  });
});

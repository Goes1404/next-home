import { describe, expect, it } from "vitest";
import { lerAtribuicao } from "./atribuicao";

describe("lerAtribuicao", () => {
  it("preserva UTMs e click IDs conhecidos", () => {
    expect(lerAtribuicao("?utm_source=google&utm_campaign=alphaville&gclid=abc-123")).toEqual({
      utm_source: "google",
      utm_campaign: "alphaville",
      gclid: "abc-123",
    });
  });

  it("ignora parâmetros desconhecidos e valores vazios", () => {
    expect(lerAtribuicao("?utm_medium=&token=segredo&fbclid=fb-1")).toEqual({ fbclid: "fb-1" });
  });
});

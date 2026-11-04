import { describe, expect, it } from "vitest";
import { quantasPessoasRecebem } from "./contagemDoPublico";

describe("a contagem da prévia do público (04/11/2026)", () => {
  it("plural sem acento dobrado: era 'receberáão'", () => {
    expect(quantasPessoasRecebem(1)).toBe("1 pessoa receberá");
    expect(quantasPessoasRecebem(25)).toBe("25 pessoas receberão");
    expect(quantasPessoasRecebem(0)).toBe("0 pessoas receberão");
  });
});

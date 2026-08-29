import { describe, expect, it } from "vitest";
import { idEventoMarketing } from "./eventos";

describe("idEventoMarketing", () => {
  it("gera uma chave determinística para deduplicação", () => {
    expect(idEventoMarketing("lead.criado", " ABC-123 ")).toBe("lead.criado:abc-123:v1");
    expect(idEventoMarketing("lead.criado", "abc-123")).toBe("lead.criado:abc-123:v1");
  });

  it("separa versões da mesma transição", () => {
    expect(idEventoMarketing("lead.qualificado", "lead-1", 2)).toBe(
      "lead.qualificado:lead-1:v2",
    );
  });

  it("recusa identidade vazia", () => {
    expect(() => idEventoMarketing("lead.criado", "  ")).toThrow("entidadeId é obrigatório");
  });
});

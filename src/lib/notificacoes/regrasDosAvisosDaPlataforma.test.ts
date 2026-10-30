import { describe, expect, it } from "vitest";
import { resumoDasCobrancas, rotuloDaContaNova } from "./regrasDosAvisosDaPlataforma";

describe("resumo diário das mensalidades para o ADM", () => {
  it("sem atraso, não avisa", () => {
    expect(
      resumoDasCobrancas([
        { nome: "A", estado: "em_dia", diasDeAtraso: 0, temEmAberto: false },
        { nome: "Next", estado: "isento", diasDeAtraso: 0, temEmAberto: false },
        { nome: "Manual", estado: "suspenso", diasDeAtraso: 0, temEmAberto: false },
      ]),
    ).toBeNull();
  });

  it("lista pendentes e suspensas por atraso, a mais atrasada primeiro", () => {
    expect(
      resumoDasCobrancas([
        { nome: "Sol", estado: "pendente", diasDeAtraso: 2, temEmAberto: true },
        { nome: "Lua", estado: "suspenso", diasDeAtraso: 9, temEmAberto: true },
        { nome: "Mar", estado: "pendente", diasDeAtraso: 0, temEmAberto: true },
      ]),
    ).toEqual({
      titulo: "3 mensalidades em aberto",
      corpo: "Lua (suspensa, 9 dias), Sol (2 dias), Mar (vence hoje).",
    });
  });

  it("mais de três vira 'e mais N'", () => {
    const lista = ["A", "B", "C", "D", "E"].map((nome, i) => ({
      nome,
      estado: "pendente" as const,
      diasDeAtraso: 5 - i,
      temEmAberto: true,
    }));
    expect(resumoDasCobrancas(lista)?.corpo).toBe("A (5 dias), B (4 dias), C (3 dias) e mais 2.");
  });
});

describe("rótulo da conta nova no aviso (pelo ramo)", () => {
  it("imobiliária (ou sem ramo) mantém o texto de sempre; outro ramo diz o ramo", () => {
    expect(rotuloDaContaNova("imobiliaria")).toBe("imobiliária");
    expect(rotuloDaContaNova("independente", "imobiliaria")).toBe("corretor independente");
    expect(rotuloDaContaNova("imobiliaria", "outro", "Pet shop")).toBe("Pet shop, empresa");
    expect(rotuloDaContaNova("independente", "outro", "Pet shop")).toBe("Pet shop, profissional independente");
  });
});

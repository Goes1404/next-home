import { describe, expect, it } from "vitest";
import { INSTANCIA_DA_PROSPECCAO, resumoDaConferencia, separarConferencia } from "./whatsappDaProspeccao";

describe("conferir quem tem WhatsApp na prospecção (21/11/2026)", () => {
  const leads = [
    { id: "a", whatsapp: "5511999990001" },
    { id: "b", whatsapp: "5511999990002" },
    { id: "c", whatsapp: "5511999990003" },
    { id: "d", whatsapp: null },
  ];

  it("só tira quem o WhatsApp disse que não tem; sem resposta fica", () => {
    const respostas = new Map([
      ["5511999990001", true],
      ["5511999990002", false],
    ]);
    const c = separarConferencia(leads, respostas);
    expect(c.semWhatsapp).toEqual(["b"]);
    expect(c.comWhatsapp).toBe(1);
    expect(c.semResposta).toBe(1);
  });

  it("resume em português, com singular e plural", () => {
    expect(resumoDaConferencia({ semWhatsapp: ["b"], comWhatsapp: 1, semResposta: 0 })).toBe(
      "1 tem WhatsApp, 1 sem WhatsApp saiu da lista (foram para Perdido).",
    );
    expect(resumoDaConferencia({ semWhatsapp: ["b", "c"], comWhatsapp: 30, semResposta: 2 })).toContain("2 sem resposta");
  });

  it("nunca é a instância central do CRM", () => {
    expect(INSTANCIA_DA_PROSPECCAO).toBe("astro-prospeccao");
  });
});

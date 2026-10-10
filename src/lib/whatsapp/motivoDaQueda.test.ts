import { describe, expect, it } from "vitest";
import { codigoDaQueda, motivoDaQueda, motivoGuardadoNaEvolution, quedaPelaConta } from "./motivoDaQueda";

describe("codigoDaQueda", () => {
  it("aceita o código como número ou como texto de três dígitos", () => {
    expect(codigoDaQueda(401)).toBe(401);
    expect(codigoDaQueda("403")).toBe(403);
  });

  it("200 é conectado, não queda", () => {
    expect(codigoDaQueda(200)).toBeNull();
  });

  it("o que não é código vira nulo", () => {
    expect(codigoDaQueda(undefined)).toBeNull();
    expect(codigoDaQueda(null)).toBeNull();
    expect(codigoDaQueda("abc")).toBeNull();
    expect(codigoDaQueda(4010)).toBeNull();
    expect(codigoDaQueda(40.1)).toBeNull();
  });
});

describe("motivoDaQueda", () => {
  it("diz em português o que o WhatsApp quis dizer", () => {
    expect(motivoDaQueda(401)).toContain("desconectou este aparelho da conta");
    expect(motivoDaQueda(403)).toContain("restrição ou bloqueio");
    expect(motivoDaQueda(440)).toContain("aberto em outro lugar");
  });

  it("código desconhecido aparece com o número, sem inventar motivo", () => {
    expect(motivoDaQueda(499)).toBe("o WhatsApp encerrou a conexão (código 499)");
  });

  it("sem código, sem motivo", () => {
    expect(motivoDaQueda(null)).toBeNull();
    expect(motivoDaQueda(200)).toBeNull();
  });
});

describe("quedaPelaConta", () => {
  it("só as quedas que a Evolution não reconecta sozinha pedem olhar o celular", () => {
    for (const c of [401, 403, 402, 406]) expect(quedaPelaConta(c), String(c)).toBe(true);
    for (const c of [428, 408, 440, 500, 515]) expect(quedaPelaConta(c), String(c)).toBe(false);
    expect(quedaPelaConta(null)).toBe(false);
  });
});

describe("motivoGuardadoNaEvolution", () => {
  /** O número da Bruna caiu em 08/10 às 16h10 (19h10 UTC). */
  const QUEDA = new Date("2026-10-08T19:10:00Z");
  const AGORA = new Date("2026-10-10T17:00:00Z");

  it("lê o código da lista da v2 quando a data bate com a queda", () => {
    const resposta = [{ name: "bruna", disconnectionReasonCode: 401, disconnectionAt: "2026-10-08T19:09:40.000Z" }];
    expect(motivoGuardadoNaEvolution(resposta, QUEDA, AGORA)).toBe(401);
  });

  it("aceita o código dentro de `instance` e como objeto único", () => {
    const resposta = { instance: { disconnectionReasonCode: "403", disconnectionAt: "2026-10-08T19:20:00Z" } };
    expect(motivoGuardadoNaEvolution(resposta, QUEDA, AGORA)).toBe(403);
  });

  it("código de uma queda mais antiga não vale para esta", () => {
    const resposta = [{ disconnectionReasonCode: 401, disconnectionAt: "2026-10-01T10:00:00Z" }];
    expect(motivoGuardadoNaEvolution(resposta, QUEDA, AGORA)).toBeNull();
  });

  it("código sem data não vale: dizer o motivo de outra queda é pior que não dizer", () => {
    expect(motivoGuardadoNaEvolution([{ disconnectionReasonCode: 401 }], QUEDA, AGORA)).toBeNull();
  });

  it("resposta vazia, nula ou estranha não quebra", () => {
    expect(motivoGuardadoNaEvolution(null, QUEDA, AGORA)).toBeNull();
    expect(motivoGuardadoNaEvolution([], QUEDA, AGORA)).toBeNull();
    expect(motivoGuardadoNaEvolution("erro", QUEDA, AGORA)).toBeNull();
    expect(motivoGuardadoNaEvolution([{ disconnectionReasonCode: 401, disconnectionAt: "ontem" }], QUEDA, AGORA)).toBeNull();
  });
});

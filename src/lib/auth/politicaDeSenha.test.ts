import { describe, expect, it } from "vitest";
import {
  diasParaVencer,
  erroDaSenha,
  regrasQueFaltam,
  senhaTrocadaEm,
  senhaVencida,
  vencimentoDaSenha,
} from "./politicaDeSenha";

describe("régua de senha", () => {
  it("aceita senha com tamanho, maiúscula, minúscula, número e símbolo", () => {
    expect(erroDaSenha("Exemplo#2026")).toBeNull();
    expect(erroDaSenha("Ação#2026x")).toBeNull();
  });

  it("recusa e diz exatamente o que falta", () => {
    expect(regrasQueFaltam("dudu123").map((r) => r.id)).toEqual(["tamanho", "maiuscula", "simbolo"]);
    expect(erroDaSenha("dudu123")).toBe(
      "A senha precisa de: 8 ou mais caracteres, uma letra maiúscula e um símbolo (! @ # $ …).",
    );
    expect(erroDaSenha("Abcdefg1")).toBe("A senha precisa de: um símbolo (! @ # $ …).");
  });

  it("espaço não conta como símbolo", () => {
    expect(regrasQueFaltam("Abcdef 12").map((r) => r.id)).toEqual(["simbolo"]);
  });
});

describe("validade de 90 dias", () => {
  const trocada = new Date("2026-10-29T12:00:00Z");

  it("vence 90 dias depois da troca", () => {
    expect(vencimentoDaSenha(trocada).toISOString()).toBe("2027-01-27T12:00:00.000Z");
    expect(senhaVencida(trocada, new Date("2027-01-27T11:59:59Z"))).toBe(false);
    expect(senhaVencida(trocada, new Date("2027-01-27T12:00:00Z"))).toBe(true);
  });

  it("conta os dias que faltam", () => {
    expect(diasParaVencer(trocada, new Date("2027-01-20T12:00:00Z"))).toBe(7);
    expect(diasParaVencer(trocada, new Date("2027-02-01T12:00:00Z"))).toBeLessThan(0);
  });

  it("lê a data do app_metadata e ignora lixo", () => {
    expect(senhaTrocadaEm({ senha_trocada_em: "2026-10-29T12:00:00Z" })?.toISOString()).toBe("2026-10-29T12:00:00.000Z");
    expect(senhaTrocadaEm({ senha_trocada_em: "ontem" })).toBeNull();
    expect(senhaTrocadaEm({})).toBeNull();
    expect(senhaTrocadaEm(null)).toBeNull();
  });
});

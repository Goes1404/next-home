import { describe, expect, it } from "vitest";
import { quandoCurto } from "./quando";

/** Uma terça-feira, 15h00 em São Paulo (18:00 UTC). */
const AGORA = new Date("2026-09-08T18:00:00Z");

describe("o quando curto da lista de conversas", () => {
  it("o que acabou de acontecer é 'agora'", () => {
    expect(quandoCurto("2026-09-08T17:59:30Z", AGORA)).toBe("agora");
  });

  it("data de hoje vira hora — é o que separa duas conversas do mesmo dia", () => {
    expect(quandoCurto("2026-09-08T12:32:00Z", AGORA)).toBe("09:32");
  });

  it("ontem é 'ontem', por extenso", () => {
    expect(quandoCurto("2026-09-07T18:00:00Z", AGORA)).toBe("ontem");
  });

  /*
   * A razão de o dia ser o CIVIL de São Paulo e não uma subtração de horas:
   * 23:30 de ontem está a menos de 24h, mas quem viveu o dia diz "ontem".
   */
  it("23h30 de ontem é ontem, mesmo faltando 24 horas", () => {
    const meiaNoiteEMeia = new Date("2026-09-09T03:30:00Z"); // 00:30 em SP
    expect(quandoCurto("2026-09-09T02:30:00Z", meiaNoiteEMeia)).toBe("ontem");
  });

  it("dentro da semana vira o dia da semana, sem ponto", () => {
    // Sexta-feira, 04/09/2026.
    expect(quandoCurto("2026-09-04T18:00:00Z", AGORA)).toBe("sex");
  });

  it("passou da semana vira dia e mês", () => {
    expect(quandoCurto("2026-08-20T18:00:00Z", AGORA)).toBe("20 ago");
  });

  it("de outro ano leva o ano junto", () => {
    expect(quandoCurto("2025-12-20T18:00:00Z", AGORA)).toBe("20 dez 25");
  });

  it("data inválida não escreve lixo na tela", () => {
    expect(quandoCurto("qualquer coisa", AGORA)).toBe("");
  });

  it("relógio adiantado cai em 'agora' em vez de mostrar o futuro", () => {
    expect(quandoCurto("2026-09-08T18:05:00Z", AGORA)).toBe("agora");
  });
});

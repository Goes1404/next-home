import { describe, expect, it } from "vitest";
import { horasDesdeAUltimaFala } from "./tempoDaConversa";

const agora = new Date("2026-09-11T12:00:00Z");
const ha = (horas: number) => new Date(agora.getTime() - horas * 3_600_000).toISOString();

describe("horasDesdeAUltimaFala", () => {
  it("mede o silêncio ANTES da mensagem atual", () => {
    const falas = [{ em: ha(200) }, { em: ha(96) }, { em: ha(0) }];
    expect(Math.round(horasDesdeAUltimaFala(falas, agora))).toBe(96);
  });

  /*
   * Errar para o lado de NÃO retomar custa uma frase; errar para o outro faz
   * a IA perguntar "ainda está procurando?" a quem respondeu há dez minutos.
   */
  it("sem dado suficiente, devolve 0 — e 0 não dispara retomada", () => {
    expect(horasDesdeAUltimaFala([], agora)).toBe(0);
    expect(horasDesdeAUltimaFala([{ em: ha(500) }], agora)).toBe(0);
    expect(horasDesdeAUltimaFala([{ em: null }, { em: ha(0) }], agora)).toBe(0);
    expect(horasDesdeAUltimaFala([{ em: "não é data" }, { em: ha(0) }], agora)).toBe(0);
  });

  it("relógio torto não devolve tempo negativo", () => {
    const futuro = [{ em: new Date(agora.getTime() + 3_600_000).toISOString() }, { em: ha(0) }];
    expect(horasDesdeAUltimaFala(futuro, agora)).toBe(0);
  });
});

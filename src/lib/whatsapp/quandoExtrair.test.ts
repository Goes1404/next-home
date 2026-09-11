import { describe, expect, it } from "vitest";
import { devoExtrair, MINUTOS_ENTRE_EXTRACOES } from "./quandoExtrair";

const agora = new Date("2026-09-11T12:00:00Z");
const haMinutos = (m: number) => new Date(agora.getTime() - m * 60_000);

describe("devoExtrair", () => {
  const base = { ehAtendimento: true, temLead: true, ultimaExtracaoEm: null, agora };

  it("conversa nunca extraída extrai", () => {
    expect(devoExtrair(base)).toBe(true);
  });

  /*
   * A trava que mais importa. A linha é o WhatsApp pessoal do corretor:
   * extrair ficha da conversa da família dele é o que a 0087 veio impedir,
   * e aqui o risco é maior que o de gravar texto — extrair ESCREVE dado de
   * uma pessoa que nunca falou com a imobiliária.
   */
  it("nunca extrai de conversa que não é atendimento", () => {
    expect(devoExtrair({ ...base, ehAtendimento: false })).toBe(false);
    expect(devoExtrair({ ...base, ehAtendimento: false, ultimaExtracaoEm: haMinutos(999) })).toBe(false);
  });

  it("sem lead não há ficha para escrever", () => {
    expect(devoExtrair({ ...base, temLead: false })).toBe(false);
  });

  it("uma rajada de cinco balões é UMA extração", () => {
    expect(devoExtrair({ ...base, ultimaExtracaoEm: haMinutos(1) })).toBe(false);
    expect(devoExtrair({ ...base, ultimaExtracaoEm: haMinutos(MINUTOS_ENTRE_EXTRACOES - 1) })).toBe(false);
  });

  it("passado o intervalo, extrai de novo", () => {
    expect(devoExtrair({ ...base, ultimaExtracaoEm: haMinutos(MINUTOS_ENTRE_EXTRACOES + 1) })).toBe(true);
  });
});

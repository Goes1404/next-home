import { describe, expect, it } from "vitest";
import { deveAvisarMatch, textoDoAvisoDeMatch } from "./regrasDoAvisoDeMatch";

/** Quando avisar "N leads seus combinam com o imóvel" (29/10/2026). */

const agora = new Date("2026-10-29T12:00:00Z");
const ha = (ms: number) => new Date(agora.getTime() - ms).toISOString();
const DIA = 86_400_000;

describe("deveAvisarMatch", () => {
  it("primeiro aviso daquele imóvel: avisa; sem lead que combine: não", () => {
    expect(deveAvisarMatch({ leadsAgora: 2, anterior: null, ultimoDoCorretor: null, agora })).toBe(true);
    expect(deveAvisarMatch({ leadsAgora: 0, anterior: null, ultimoDoCorretor: null, agora })).toBe(false);
  });

  it("editar o imóvel sem ganhar lead não avisa de novo", () => {
    expect(deveAvisarMatch({ leadsAgora: 2, anterior: { leads: 2, avisado_em: ha(30 * DIA) }, ultimoDoCorretor: null, agora })).toBe(false);
  });

  it("a contagem cresceu: só avisa depois da janela de 7 dias", () => {
    expect(deveAvisarMatch({ leadsAgora: 3, anterior: { leads: 2, avisado_em: ha(2 * DIA) }, ultimoDoCorretor: null, agora })).toBe(false);
    expect(deveAvisarMatch({ leadsAgora: 3, anterior: { leads: 2, avisado_em: ha(8 * DIA) }, ultimoDoCorretor: null, agora })).toBe(true);
  });

  it("no máximo um aviso destes por corretor por hora, entre todos os imóveis", () => {
    expect(deveAvisarMatch({ leadsAgora: 1, anterior: null, ultimoDoCorretor: ha(10 * 60_000), agora })).toBe(false);
    expect(deveAvisarMatch({ leadsAgora: 1, anterior: null, ultimoDoCorretor: ha(61 * 60_000), agora })).toBe(true);
  });
});

describe("textoDoAvisoDeMatch", () => {
  it("diz quantos e cita até dois nomes", () => {
    expect(textoDoAvisoDeMatch({ imovel: "Vitra", leads: 1, nomes: ["Ana"] }).titulo).toBe("1 lead seu combina com Vitra");
    const t = textoDoAvisoDeMatch({ imovel: "Vitra", leads: 4, nomes: ["Ana", "Bia", "Caio", "Davi"] });
    expect(t.titulo).toBe("4 leads seus combinam com Vitra");
    expect(t.corpo.startsWith("Ana e Bia e mais 2")).toBe(true);
  });
});

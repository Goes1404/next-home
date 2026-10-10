import { describe, expect, it } from "vitest";
import {
  diaDaQueda,
  MINUTOS_PARA_A_QUEDA_CONTAR,
  motivoAindaNaoConsultado,
  motivoDaPausaPorQueda,
  quedaPedeProtecao,
  type FotoDaQueda,
} from "./protecaoDaQueda";

/** O número da Bruna: conectado em 28/09, caiu em 08/10 às 16h10 (19h10 UTC). */
const CAIU = new Date("2026-10-08T19:10:00Z");
const BRUNA: FotoDaQueda = {
  statusConexao: "desconectado",
  conectadoEm: new Date("2026-09-28T21:03:00Z"),
  desconectadoEm: CAIU,
  quedaTratadaEm: null,
};
const minutosDepois = (m: number) => new Date(CAIU.getTime() + m * 60_000);

describe("quedaPedeProtecao", () => {
  it("o caso da Bruna: fora do ar há mais de 30 minutos e sem proteção pede proteção", () => {
    expect(quedaPedeProtecao(BRUNA, minutosDepois(MINUTOS_PARA_A_QUEDA_CONTAR))).toBe(true);
  });

  it("oscilação não conta: antes dos 30 minutos, nada acontece", () => {
    expect(quedaPedeProtecao(BRUNA, minutosDepois(MINUTOS_PARA_A_QUEDA_CONTAR - 1))).toBe(false);
  });

  it("número no ar não pede nada", () => {
    expect(quedaPedeProtecao({ ...BRUNA, statusConexao: "conectado" }, minutosDepois(120))).toBe(false);
  });

  it("número que nunca conectou não caiu", () => {
    expect(quedaPedeProtecao({ ...BRUNA, conectadoEm: null }, minutosDepois(120))).toBe(false);
  });

  it("a mesma queda não é protegida duas vezes (nem repausa a lista que o corretor retomou)", () => {
    expect(quedaPedeProtecao({ ...BRUNA, quedaTratadaEm: minutosDepois(31) }, minutosDepois(600))).toBe(false);
  });

  it("queda nova depois de uma tratada pede proteção de novo", () => {
    const tratadaAntes = new Date(CAIU.getTime() - 86_400_000);
    expect(quedaPedeProtecao({ ...BRUNA, quedaTratadaEm: tratadaAntes }, minutosDepois(45))).toBe(true);
  });
});

describe("motivoAindaNaoConsultado", () => {
  it("pergunta uma vez por queda", () => {
    expect(motivoAindaNaoConsultado({ statusConexao: "desconectado", desconectadoEm: CAIU, motivoQuedaEm: null })).toBe(true);
    expect(
      motivoAindaNaoConsultado({ statusConexao: "desconectado", desconectadoEm: CAIU, motivoQuedaEm: minutosDepois(1) }),
    ).toBe(false);
  });

  it("consulta de uma queda anterior não vale para a atual", () => {
    expect(
      motivoAindaNaoConsultado({ statusConexao: "desconectado", desconectadoEm: CAIU, motivoQuedaEm: minutosDepois(-60) }),
    ).toBe(true);
  });

  it("número no ar não tem o que consultar", () => {
    expect(motivoAindaNaoConsultado({ statusConexao: "conectado", desconectadoEm: CAIU, motivoQuedaEm: null })).toBe(false);
  });
});

describe("motivoDaPausaPorQueda", () => {
  it("diz quando caiu, por quê e o que acontece ao retomar", () => {
    const texto = motivoDaPausaPorQueda(CAIU, "o WhatsApp recusou a conexão do número");
    expect(texto).toContain("08/10 às 16h10");
    expect(texto).toContain("(o WhatsApp recusou a conexão do número)");
    expect(texto).toContain("até 15 mensagens por dia");
    expect(texto).toContain("Reconecte e confira o celular");
  });

  it("sem motivo conhecido, não inventa um", () => {
    expect(motivoDaPausaPorQueda(CAIU, null)).not.toContain("(");
  });
});

describe("diaDaQueda", () => {
  it("é o dia de São Paulo, não o de Greenwich", () => {
    // 01h30 de 09/10 em UTC ainda é 22h30 de 08/10 em São Paulo.
    expect(diaDaQueda(new Date("2026-10-09T01:30:00Z"))).toBe("2026-10-08");
  });
});

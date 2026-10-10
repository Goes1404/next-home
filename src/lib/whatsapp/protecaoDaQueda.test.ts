import { describe, expect, it } from "vitest";
import { DIAS_FORA_PARA_RECOMECAR } from "./antiBan";
import {
  diaDaQueda,
  MINUTOS_PARA_A_QUEDA_CONTAR,
  motivoAindaNaoConsultado,
  motivoDaPausaPorQueda,
  quedaPedePausa,
  quedaPedeRecomeco,
  type FotoDaQueda,
} from "./protecaoDaQueda";

/** O número da Bruna: conectado em 28/09, caiu em 08/10 às 16h10 (19h10 UTC). */
const CAIU = new Date("2026-10-08T19:10:00Z");
const BRUNA: FotoDaQueda = {
  statusConexao: "desconectado",
  conectadoEm: new Date("2026-09-28T21:03:00Z"),
  desconectadoEm: CAIU,
  quedaTratadaEm: null,
  aquecimentoDesde: null,
};
const minutosDepois = (m: number) => new Date(CAIU.getTime() + m * 60_000);
const diasDepois = (d: number) => minutosDepois(d * 24 * 60);

describe("quedaPedePausa", () => {
  it("o caso da Bruna: fora do ar há mais de 30 minutos e sem pausa pede a pausa", () => {
    expect(quedaPedePausa(BRUNA, minutosDepois(MINUTOS_PARA_A_QUEDA_CONTAR))).toBe(true);
  });

  it("oscilação não conta: antes dos 30 minutos, nada acontece", () => {
    expect(quedaPedePausa(BRUNA, minutosDepois(MINUTOS_PARA_A_QUEDA_CONTAR - 1))).toBe(false);
  });

  it("número no ar não pede nada", () => {
    expect(quedaPedePausa({ ...BRUNA, statusConexao: "conectado" }, minutosDepois(120))).toBe(false);
  });

  it("número que nunca conectou não caiu", () => {
    expect(quedaPedePausa({ ...BRUNA, conectadoEm: null }, minutosDepois(120))).toBe(false);
  });

  it("a mesma queda não pausa duas vezes (nem repausa a lista que o corretor retomou)", () => {
    expect(quedaPedePausa({ ...BRUNA, quedaTratadaEm: minutosDepois(31) }, minutosDepois(600))).toBe(false);
  });

  it("queda nova depois de uma tratada pede a pausa de novo", () => {
    const tratadaAntes = new Date(CAIU.getTime() - 86_400_000);
    expect(quedaPedePausa({ ...BRUNA, quedaTratadaEm: tratadaAntes }, minutosDepois(45))).toBe(true);
  });
});

describe("quedaPedeRecomeco (0176: o limite só volta a 15 depois de 3 dias sem conectar)", () => {
  it("são 3 dias, decisão do dono da conta em 10/10/2026", () => {
    expect(DIAS_FORA_PARA_RECOMECAR).toBe(3);
  });

  it("queda de horas não mexe no limite: o caso das quatro quedas de 10/10", () => {
    for (const horas of [1, 22, 29, 50]) {
      expect(quedaPedeRecomeco(BRUNA, minutosDepois(horas * 60)), `${horas}h fora`).toBe(false);
    }
  });

  it("um minuto antes dos 3 dias ainda não recomeça; nos 3 dias, recomeça", () => {
    expect(quedaPedeRecomeco(BRUNA, minutosDepois(3 * 24 * 60 - 1))).toBe(false);
    expect(quedaPedeRecomeco(BRUNA, diasDepois(3))).toBe(true);
  });

  it("a pausa da lista já ter rodado não impede o recomeço", () => {
    expect(quedaPedeRecomeco({ ...BRUNA, quedaTratadaEm: minutosDepois(31) }, diasDepois(4))).toBe(true);
  });

  it("a mesma queda não recomeça duas vezes", () => {
    expect(quedaPedeRecomeco({ ...BRUNA, aquecimentoDesde: CAIU }, diasDepois(5))).toBe(false);
  });

  it("recomeço de uma queda antiga não vale para a atual", () => {
    const quedaAntiga = new Date(CAIU.getTime() - 20 * 86_400_000);
    expect(quedaPedeRecomeco({ ...BRUNA, aquecimentoDesde: quedaAntiga }, diasDepois(3))).toBe(true);
  });

  it("número que voltou antes dos 3 dias não recomeça", () => {
    expect(quedaPedeRecomeco({ ...BRUNA, statusConexao: "conectado" }, diasDepois(10))).toBe(false);
  });

  it("número que nunca conectou não caiu", () => {
    expect(quedaPedeRecomeco({ ...BRUNA, conectadoEm: null }, diasDepois(10))).toBe(false);
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
  it("diz quando caiu, por quê e o que acontece com o limite", () => {
    const texto = motivoDaPausaPorQueda(CAIU, "o WhatsApp recusou a conexão do número");
    expect(texto).toContain("08/10 às 16h10");
    expect(texto).toContain("(o WhatsApp recusou a conexão do número)");
    expect(texto).toContain("Reconecte e confira o celular");
    // A pausa sai aos 30 minutos: o limite só volta a 15 se a queda passar
    // de 3 dias, e o texto não pode prometer o recomeço como certo.
    expect(texto).toContain("Se ele passar 3 dias ou mais sem conectar, o limite volta a 15 mensagens por dia");
    expect(texto).not.toMatch(/Ao retomar, a lista recomeça/);
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

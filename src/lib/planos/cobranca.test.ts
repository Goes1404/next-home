import { describe, expect, it } from "vitest";
import {
  DIAS_ATE_SUSPENDER,
  avisoDoPainel,
  diaDoVencimentoValido,
  diaEMes,
  estaSuspenso,
  primeiraCompetencia,
  situacaoDaCobranca,
} from "./cobranca";

/** Meio-dia em São Paulo (UTC-3) do dia pedido: longe das viradas de dia. */
const meioDia = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

const BASE = {
  plano: "essencial",
  suspensoManual: false,
  criadoEm: "2026-08-10T15:00:00-03:00",
  diaDoVencimento: 10,
  competenciasPagas: ["2026-08-01"],
};

describe("situacaoDaCobranca", () => {
  it("grupo novo, antes do primeiro vencimento, está em dia", () => {
    const s = situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-08-10") });
    expect(s.estado).toBe("em_dia");
    expect(s.competenciaEmAberto).toBeNull();
    expect(s.diasDeAtraso).toBe(0);
    expect(s.proximoVencimento).toBe("2026-09-10");
  });

  it("sem pagamento algum, a primeira competência vence no dia do cadastro", () => {
    const s = situacaoDaCobranca({ ...BASE, competenciasPagas: [], hoje: meioDia("2026-08-10") });
    expect(s.estado).toBe("pendente");
    expect(s.competenciaEmAberto).toBe("2026-08-01");
    expect(s.vencimento).toBe("2026-08-10");
  });

  it("no dia do vencimento sem pagamento é pendente com 0 dias", () => {
    const s = situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-09-10") });
    expect(s).toMatchObject({
      estado: "pendente",
      competenciaEmAberto: "2026-09-01",
      vencimento: "2026-09-10",
      diasDeAtraso: 0,
      suspendeEm: "2026-09-15",
      proximoVencimento: "2026-10-10",
    });
  });

  it("com 4 dias de atraso ainda é pendente", () => {
    const s = situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-09-14") });
    expect(s.estado).toBe("pendente");
    expect(s.diasDeAtraso).toBe(DIAS_ATE_SUSPENDER - 1);
  });

  it("com 5 dias de atraso está suspenso", () => {
    const s = situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-09-15") });
    expect(s.estado).toBe("suspenso");
    expect(s.diasDeAtraso).toBe(5);
    expect(estaSuspenso(s)).toBe(true);
  });

  it("pagar a competência em aberto volta a em dia", () => {
    const s = situacaoDaCobranca({ ...BASE, competenciasPagas: ["2026-08-01", "2026-09-01"], hoje: meioDia("2026-09-20") });
    expect(s.estado).toBe("em_dia");
    expect(s.diasDeAtraso).toBe(0);
    expect(s.proximoVencimento).toBe("2026-10-10");
    expect(estaSuspenso(s)).toBe(false);
  });

  it("duas competências atrasadas mostram a mais antiga", () => {
    const s = situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-10-12") });
    expect(s.competenciaEmAberto).toBe("2026-09-01");
    expect(s.vencimento).toBe("2026-09-10");
    expect(s.diasDeAtraso).toBe(32);
    expect(s.estado).toBe("suspenso");
  });

  it("pagar a mais recente não tira o atraso da mais antiga", () => {
    const s = situacaoDaCobranca({
      ...BASE,
      competenciasPagas: ["2026-08-01", "2026-10-01"],
      hoje: meioDia("2026-10-12"),
    });
    expect(s.competenciaEmAberto).toBe("2026-09-01");
  });

  it("o plano de custo é isento mesmo sem pagamento algum", () => {
    const s = situacaoDaCobranca({ ...BASE, plano: "custo", competenciasPagas: [], hoje: meioDia("2027-03-20") });
    expect(s.estado).toBe("isento");
    expect(s.competenciaEmAberto).toBeNull();
    expect(s.suspendeEm).toBeNull();
    expect(estaSuspenso(s)).toBe(false);
  });

  it("a suspensão manual vence tudo, inclusive o plano de custo e a cobrança em dia", () => {
    expect(situacaoDaCobranca({ ...BASE, suspensoManual: true, hoje: meioDia("2026-08-11") }).estado).toBe("suspenso");
    const custo = situacaoDaCobranca({ ...BASE, plano: "custo", suspensoManual: true, competenciasPagas: [], hoje: meioDia("2026-08-11") });
    expect(custo.estado).toBe("suspenso");
    expect(custo.competenciaEmAberto).toBeNull();
  });

  it("a virada de mês às 23h de São Paulo não muda o dia", () => {
    // 23h de 09/09 em SP = 02h de 10/09 em UTC: para o servidor já é o dia do vencimento.
    const aindaNove = situacaoDaCobranca({ ...BASE, hoje: new Date("2026-09-09T23:00:00-03:00") });
    expect(aindaNove.estado).toBe("em_dia");
    // 23h de 31/08 em SP já é 1º de setembro em UTC; o mês da competência não avança.
    const fimDeAgosto = situacaoDaCobranca({ ...BASE, competenciasPagas: [], hoje: new Date("2026-08-31T23:30:00-03:00") });
    expect(fimDeAgosto.competenciaEmAberto).toBe("2026-08-01");
    expect(fimDeAgosto.diasDeAtraso).toBe(21);
    const diaDez = situacaoDaCobranca({ ...BASE, hoje: new Date("2026-09-10T00:30:00-03:00") });
    expect(diaDez).toMatchObject({ estado: "pendente", diasDeAtraso: 0 });
  });

  it("o cadastro às 22h do último dia do mês conta o mês de São Paulo", () => {
    // 22h de 31/08 em SP = 01h de 01/09 em UTC.
    expect(primeiraCompetencia("2026-09-01T01:00:00Z")).toBe("2026-08-01");
  });

  it("vira o ano", () => {
    const s = situacaoDaCobranca({
      ...BASE,
      criadoEm: "2026-11-20T12:00:00-03:00",
      diaDoVencimento: 20,
      competenciasPagas: ["2026-11-01", "2026-12-01"],
      hoje: meioDia("2027-01-22"),
    });
    expect(s).toMatchObject({ estado: "pendente", competenciaEmAberto: "2027-01-01", vencimento: "2027-01-20", diasDeAtraso: 2 });
    expect(s.proximoVencimento).toBe("2027-02-20");
  });

  it("a suspensão atravessa o fim do mês (vencimento 28 + 5 dias)", () => {
    const s = situacaoDaCobranca({ ...BASE, diaDoVencimento: 28, competenciasPagas: ["2026-08-01"], hoje: meioDia("2026-09-28") });
    expect(s.suspendeEm).toBe("2026-10-03");
  });
});

describe("diaDoVencimentoValido", () => {
  it("prende o dia entre 1 e 28", () => {
    expect(diaDoVencimentoValido(31)).toBe(28);
    expect(diaDoVencimentoValido(0)).toBe(1);
    expect(diaDoVencimentoValido(Number.NaN)).toBe(1);
    expect(diaDoVencimentoValido(15.9)).toBe(15);
  });
});

describe("avisoDoPainel", () => {
  it("pendente avisa o vencimento e o dia em que os recursos pagos param", () => {
    const aviso = avisoDoPainel(situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-09-12") }));
    expect(aviso?.titulo).toContain("10/09");
    expect(aviso?.detalhe).toContain("15/09");
  });

  it("suspenso diz o que parou e que o painel continua", () => {
    const aviso = avisoDoPainel(situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-09-20") }));
    expect(aviso?.titulo).toBe("Mensalidade em atraso");
    expect(aviso?.detalhe).toContain("IA, listas, artes e vídeos");
  });

  it("em dia e isento não avisam nada", () => {
    expect(avisoDoPainel(situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-08-20") }))).toBeNull();
    expect(avisoDoPainel(situacaoDaCobranca({ ...BASE, plano: "custo", competenciasPagas: [], hoje: meioDia("2026-12-20") }))).toBeNull();
  });

  it("diaEMes escreve DD/MM", () => {
    expect(diaEMes("2026-09-05")).toBe("05/09");
  });
});

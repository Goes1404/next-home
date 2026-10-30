import { describe, expect, it } from "vitest";
import {
  DIAS_ATE_SUSPENDER,
  DIAS_DE_TESTE_GRATIS,
  avisoDoPainel,
  diasRestantesComoTexto,
  fimDoTesteGratis,
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

/**
 * O teste grátis (29/10/2026, 0241): "sem pagar em 7 dias, suspende
 * sozinha". Começou às 15h de 29/10 em SP, acaba às 15h de 05/11; o grupo
 * nasce com o dia do vencimento 5 e SEM a competência de valor 0 do
 * cadastro (o caminho do teste a apaga).
 */
describe("situacaoDaCobranca: teste grátis", () => {
  const INICIO = new Date("2026-10-29T15:00:00-03:00");
  const TESTE = {
    plano: "essencial",
    suspensoManual: false,
    criadoEm: INICIO.toISOString(),
    diaDoVencimento: 5,
    competenciasPagas: [] as string[],
    testeAte: fimDoTesteGratis(INICIO).toISOString(),
  };

  it("o fim do teste é o mesmo instante, 7 dias depois", () => {
    expect(DIAS_DE_TESTE_GRATIS).toBe(7);
    expect(fimDoTesteGratis(INICIO).toISOString()).toBe(new Date("2026-11-05T15:00:00-03:00").toISOString());
  });

  it("durante o teste o estado é `teste`, nada vence e conta os dias restantes", () => {
    const s = situacaoDaCobranca({ ...TESTE, hoje: INICIO });
    expect(s).toMatchObject({
      estado: "teste",
      competenciaEmAberto: null,
      vencimento: null,
      diasDeAtraso: 0,
      suspendeEm: null,
      proximoVencimento: "2026-11-05",
      fimDoTeste: "2026-11-05",
      diasDeTesteRestantes: 7,
      testeTerminouSemPagamento: false,
      emAberto: [],
    });
    expect(estaSuspenso(s)).toBe(false);
    expect(situacaoDaCobranca({ ...TESTE, hoje: new Date("2026-11-04T16:00:00-03:00") }).diasDeTesteRestantes).toBe(1);
  });

  it("no próprio dia do fim, antes da hora, ainda é teste (1 dia restante)", () => {
    const s = situacaoDaCobranca({ ...TESTE, hoje: new Date("2026-11-05T14:59:00-03:00") });
    expect(s.estado).toBe("teste");
    expect(s.diasDeTesteRestantes).toBe(1);
  });

  it("sem pagamento, suspende NO instante do fim do teste: sem os 5 dias de tolerância", () => {
    const s = situacaoDaCobranca({ ...TESTE, hoje: new Date("2026-11-05T15:00:00-03:00") });
    expect(s).toMatchObject({
      estado: "suspenso",
      competenciaEmAberto: "2026-11-01",
      vencimento: "2026-11-05",
      diasDeAtraso: 0,
      suspendeEm: "2026-11-05",
      testeTerminouSemPagamento: true,
    });
    expect(estaSuspenso(s)).toBe(true);
    // Um grupo comum, no mesmo ponto, ainda estaria só pendente.
    const comum = situacaoDaCobranca({
      ...TESTE,
      testeAte: null,
      competenciasPagas: ["2026-10-01"],
      hoje: new Date("2026-11-05T15:00:00-03:00"),
    });
    expect(comum.estado).toBe("pendente");
  });

  it("pagar a competência do fim do teste deixa em dia, e o próximo vencimento é o dia 5 do mês seguinte", () => {
    const s = situacaoDaCobranca({ ...TESTE, competenciasPagas: ["2026-11-01"], hoje: meioDia("2026-11-20") });
    expect(s).toMatchObject({ estado: "em_dia", proximoVencimento: "2026-12-05", testeTerminouSemPagamento: false });
  });

  it("pago antes do fim (assinou durante o teste) segue `teste` até o fim e depois fica em dia", () => {
    expect(situacaoDaCobranca({ ...TESTE, competenciasPagas: ["2026-11-01"], hoje: meioDia("2026-11-01") }).estado).toBe("teste");
    expect(situacaoDaCobranca({ ...TESTE, competenciasPagas: ["2026-11-01"], hoje: meioDia("2026-11-06") }).estado).toBe("em_dia");
  });

  it("depois da primeira, as competências voltam à regra comum (5 dias de tolerância)", () => {
    const pendente = situacaoDaCobranca({ ...TESTE, competenciasPagas: ["2026-11-01"], hoje: meioDia("2026-12-08") });
    expect(pendente).toMatchObject({
      estado: "pendente",
      competenciaEmAberto: "2026-12-01",
      suspendeEm: "2026-12-10",
      testeTerminouSemPagamento: false,
    });
    expect(situacaoDaCobranca({ ...TESTE, competenciasPagas: ["2026-11-01"], hoje: meioDia("2026-12-10") }).estado).toBe("suspenso");
  });

  it("a competência do mês do cadastro não é cobrada quando o teste acaba no mês seguinte", () => {
    const s = situacaoDaCobranca({ ...TESTE, hoje: new Date("2026-11-05T15:00:00-03:00") });
    expect(s.emAberto.map((c) => c.competencia)).toEqual(["2026-11-01"]);
  });

  it("teste que acaba no mesmo mês do cadastro: a primeira competência é a desse mês, vencendo no fim do teste", () => {
    const inicio = new Date("2026-10-10T09:00:00-03:00");
    const s = situacaoDaCobranca({
      ...TESTE,
      criadoEm: inicio.toISOString(),
      diaDoVencimento: 17,
      testeAte: fimDoTesteGratis(inicio).toISOString(),
      hoje: new Date("2026-10-17T09:00:00-03:00"),
    });
    expect(s).toMatchObject({ estado: "suspenso", competenciaEmAberto: "2026-10-01", vencimento: "2026-10-17" });
  });

  it("o plano de custo ignora o teste; a suspensão manual vale durante o teste", () => {
    expect(situacaoDaCobranca({ ...TESTE, plano: "custo", hoje: meioDia("2026-12-20") }).estado).toBe("isento");
    const manual = situacaoDaCobranca({ ...TESTE, suspensoManual: true, hoje: INICIO });
    expect(manual.estado).toBe("suspenso");
    expect(manual.testeTerminouSemPagamento).toBe(false);
  });

  it("teste_ate inválido é ignorado (regra comum)", () => {
    const s = situacaoDaCobranca({ ...TESTE, testeAte: "lixo", competenciasPagas: ["2026-10-01"], hoje: meioDia("2026-10-30") });
    expect(s.estado).toBe("em_dia");
    expect(s.fimDoTeste).toBeNull();
  });

  it("a faixa do painel: dias restantes no teste, e 'teste terminou' na suspensão do fim", () => {
    const noTeste = avisoDoPainel(situacaoDaCobranca({ ...TESTE, hoje: new Date("2026-11-03T15:00:00-03:00") }));
    expect(noTeste).toMatchObject({ titulo: "Teste grátis: 2 dias restantes", suspenso: false, teste: true });
    expect(noTeste?.detalhe).toContain("05/11");
    const ultimoDia = avisoDoPainel(situacaoDaCobranca({ ...TESTE, hoje: new Date("2026-11-05T10:00:00-03:00") }));
    expect(ultimoDia?.titulo).toBe("Teste grátis: 1 dia restante");
    const fim = avisoDoPainel(situacaoDaCobranca({ ...TESTE, hoje: new Date("2026-11-06T10:00:00-03:00") }));
    expect(fim).toMatchObject({ titulo: "Seu teste grátis terminou", suspenso: true, teste: true });
    expect(diasRestantesComoTexto(3)).toBe("3 dias restantes");
  });
});

describe("emAberto", () => {
  it("lista todas as competências vencidas e não pagas, da mais antiga à mais nova", () => {
    const s = situacaoDaCobranca({ ...BASE, hoje: meioDia("2026-10-12") });
    expect(s.emAberto).toEqual([
      { competencia: "2026-09-01", vencimento: "2026-09-10" },
      { competencia: "2026-10-01", vencimento: "2026-10-10" },
    ]);
    expect(situacaoDaCobranca({ ...BASE, plano: "custo", hoje: meioDia("2026-10-12") }).emAberto).toEqual([]);
  });
});

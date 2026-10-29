import { describe, expect, it } from "vitest";
import type { SituacaoDaCobranca } from "@/lib/planos/cobranca";
import type { SituacaoDaCota } from "@/lib/planos/cotaDaIa";
import {
  calcularPainel,
  contaSemUso,
  filtrarPorIndicador,
  hrefDaLista,
  lerFiltroDeIndicador,
  maisRecente,
  pontosDaTendencia,
  ultimosMeses,
  type ContaDoPainel,
} from "./painelDeNumeros";

/** Os indicadores do painel de números da plataforma (29/10/2026): contas puras. */

const AGORA = new Date("2026-10-29T15:00:00-03:00");

const cobranca = (estado: SituacaoDaCobranca["estado"]): SituacaoDaCobranca => ({
  estado,
  competenciaEmAberto: null,
  vencimento: null,
  diasDeAtraso: 0,
  suspendeEm: null,
  proximoVencimento: "2026-11-10",
});

const uso = (respostas: number, nivel: SituacaoDaCota["nivel"] = "livre"): SituacaoDaCota =>
  ({ respostas, teto: 1000, percentual: respostas / 10, nivel }) as SituacaoDaCota;

function conta(id: string, p: Partial<ContaDoPainel> = {}): ContaDoPainel {
  return {
    id,
    tipo: "imobiliaria",
    plano: "profissional",
    situacao: "ativo",
    criadoEm: "2026-01-15T12:00:00Z",
    mensalidade: 297,
    cobranca: cobranca("em_dia"),
    usoDaIa: uso(10),
    ...p,
  };
}

const CONTAS: ContaDoPainel[] = [
  conta("a"),
  conta("b", { mensalidade: 127.5, cobranca: cobranca("pendente"), criadoEm: "2026-10-02T12:00:00Z" }),
  // A Next Home: plano de custo, nunca entra na receita.
  conta("nh", { plano: "custo", mensalidade: 500, cobranca: cobranca("isento"), usoDaIa: uso(900, "aviso") }),
  conta("s", { situacao: "suspenso", cobranca: cobranca("suspenso"), criadoEm: "2026-09-01T12:00:00Z" }),
  conta("c", { situacao: "encerrado", cobranca: cobranca("pendente"), usoDaIa: uso(0, "esgotada") }),
  // Ativa sem mensalidade definida: não é pagante.
  conta("sem", { mensalidade: null, criadoEm: "2026-10-31T02:30:00Z" }),
];

describe("calcularPainel", () => {
  const painel = calcularPainel({
    contas: CONTAS,
    custos: { a: { custoBrl: 12.35, alerta: false }, b: { custoBrl: 50, alerta: true }, nh: { custoBrl: 100, alerta: false } },
    semUso: new Set(["s", "c", "inexistente"]),
    agora: AGORA,
  });

  it("receita: só ativas, fora o plano de custo e quem não tem mensalidade", () => {
    expect(painel.receitaMensal).toBe(424.5);
    expect(painel.pagantes).toBe(2);
  });

  it("conta ativas, suspensas e canceladas pela situação", () => {
    expect(painel).toMatchObject({ ativas: 4, suspensas: 1, canceladas: 1 });
  });

  it("mensalidade em aberto: vencida ou suspensa por atraso, fora as canceladas", () => {
    expect(painel.emAberto).toEqual({ contas: 2, valor: 424.5 });
  });

  it("sem uso: só as contas da lista que não estão canceladas", () => {
    expect(painel.semUso).toBe(1);
  });

  it("sem medida de uso, o indicador é nulo (não zero)", () => {
    expect(calcularPainel({ contas: CONTAS, custos: {}, semUso: null, agora: AGORA }).semUso).toBeNull();
  });

  it("IA: soma respostas e custo; alerta por teto ou por custo, fora as canceladas", () => {
    expect(painel.ia).toEqual({ respostas: 10 + 10 + 900 + 10 + 0 + 10, custoBrl: 162.35, contasEmAlerta: 2 });
  });

  it("tendência: contas novas nos 6 meses, no fuso de São Paulo", () => {
    expect(painel.novasPorMes.map((m) => m.mes)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    // "sem" foi criada em 31/10 02:30 UTC = 30/10 23:30 em São Paulo: outubro.
    expect(painel.novasPorMes.map((m) => m.total)).toEqual([0, 0, 0, 0, 1, 2]);
    expect(painel.novasPorMes[5].rotulo).toBe("out");
  });
});

describe("ultimosMeses", () => {
  it("vira o ano", () => {
    expect(ultimosMeses(new Date("2026-02-10T12:00:00-03:00"), 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("filtro da lista pelo indicador", () => {
  const extras = { semUso: new Set(["a", "c"]), custos: { b: { alerta: true } } };
  const ids = (f: Parameters<typeof filtrarPorIndicador>[1]) => filtrarPorIndicador(CONTAS, f, extras).map((g) => g.id);

  it("cada indicador filtra o que conta", () => {
    expect(ids(null)).toEqual(CONTAS.map((g) => g.id));
    expect(ids("pagantes")).toEqual(["a", "b"]);
    expect(ids("ativas")).toEqual(["a", "b", "nh", "sem"]);
    expect(ids("suspensas")).toEqual(["s"]);
    expect(ids("canceladas")).toEqual(["c"]);
    expect(ids("em-aberto")).toEqual(["b", "s"]);
    expect(ids("sem-uso")).toEqual(["a"]);
    expect(ids("ia")).toEqual(["b", "nh"]);
  });

  it("sem medida de uso, o filtro sem-uso fica vazio", () => {
    expect(filtrarPorIndicador(CONTAS, "sem-uso", { semUso: null, custos: {} })).toEqual([]);
  });

  it("lê o ?ver= e recusa lixo (inclusive nome de propriedade de objeto)", () => {
    expect(lerFiltroDeIndicador("em-aberto")).toBe("em-aberto");
    expect(lerFiltroDeIndicador(["sem-uso", "x"])).toBe("sem-uso");
    expect(lerFiltroDeIndicador("toString")).toBeNull();
    expect(lerFiltroDeIndicador(undefined)).toBeNull();
  });

  it("monta o link com tipo e indicador", () => {
    expect(hrefDaLista({ ver: "suspensas" })).toBe("/plataforma?ver=suspensas#contas");
    expect(hrefDaLista({ tipo: "independente", ver: "ia" })).toBe("/plataforma?tipo=independente&ver=ia#contas");
    expect(hrefDaLista({ tipo: "todos" })).toBe("/plataforma#contas");
  });
});

describe("contaSemUso", () => {
  it("lead nos 7 dias basta para estar viva", () => {
    expect(contaSemUso({ leadsNosUltimosDias: 1, ultimoLoginDaEquipe: null, agora: AGORA })).toBe(false);
  });
  it("login nos 7 dias basta para estar viva", () => {
    expect(contaSemUso({ leadsNosUltimosDias: 0, ultimoLoginDaEquipe: "2026-10-25T10:00:00Z", agora: AGORA })).toBe(false);
  });
  it("sem lead e sem login recente (ou nunca) = sem uso", () => {
    expect(contaSemUso({ leadsNosUltimosDias: 0, ultimoLoginDaEquipe: "2026-10-20T10:00:00Z", agora: AGORA })).toBe(true);
    expect(contaSemUso({ leadsNosUltimosDias: 0, ultimoLoginDaEquipe: null, agora: AGORA })).toBe(true);
  });
  it("maisRecente ignora vazios", () => {
    expect(maisRecente([null, "2026-10-01T00:00:00Z", undefined, "2026-10-20T00:00:00Z", "2026-09-01T00:00:00Z"])).toBe("2026-10-20T00:00:00Z");
    expect(maisRecente([null])).toBeNull();
  });
});

describe("pontosDaTendencia", () => {
  it("o maior valor encosta no topo e o zero no chão", () => {
    const p = pontosDaTendencia([0, 2, 4], 100, 40, 0);
    expect(p).toEqual([
      { x: 0, y: 40 },
      { x: 50, y: 20 },
      { x: 100, y: 0 },
    ]);
  });
  it("tudo zero vira linha no chão", () => {
    expect(pontosDaTendencia([0, 0], 10, 10, 1).map((p) => p.y)).toEqual([9, 9]);
  });
});

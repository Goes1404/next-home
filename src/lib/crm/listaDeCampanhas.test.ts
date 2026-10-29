import { describe, expect, it } from "vitest";
import type { ResumoImpulsionamento } from "./impulsionamentosCalculo";
import {
  contarPorFiltro,
  ordenarCampanhas,
  passaNoFiltro,
  situacaoDaCampanha,
  visitaramDe,
} from "./listaDeCampanhas";

const HOJE = "2026-10-29";

function resumo(
  p: Partial<ResumoImpulsionamento> & { id: string },
): ResumoImpulsionamento {
  return {
    corretorId: "c",
    chave: p.id,
    titulo: p.id,
    url: null,
    empreendimentoId: null,
    valorGasto: null,
    primeiroLeadEm: "2026-10-01T12:00:00Z",
    ultimoLeadEm: "2026-10-28T12:00:00Z",
    leads: 0,
    visitas: 0,
    fechados: 0,
    perdidos: 0,
    degraus: {
      chegaram: 0,
      conversaram: 0,
      qualificados: 0,
      visitaram: 0,
      fecharam: 0,
      sairam: 0,
    },
    gastoTotal: null,
    custoPorLead: null,
    custoPorVisita: null,
    custoPorQualificado: null,
    taxaDeQualificados: null,
    anuncios: [],
    datasDosLeads: [],
    leadIds: [],
    ...p,
  } as ResumoImpulsionamento;
}

describe("situacaoDaCampanha", () => {
  it("campanha cadastrada segue a data de fim", () => {
    expect(
      situacaoDaCampanha(
        resumo({ id: "a", criadaPeloCorretor: true, fim: null }),
        HOJE,
      ),
    ).toBe("no_ar");
    expect(
      situacaoDaCampanha(
        resumo({ id: "a", criadaPeloCorretor: true, fim: HOJE }),
        HOJE,
      ),
    ).toBe("no_ar");
    expect(
      situacaoDaCampanha(
        resumo({ id: "a", criadaPeloCorretor: true, fim: "2026-10-20" }),
        HOJE,
      ),
    ).toBe("encerrada");
  });

  it("anúncio detectado encerra depois de 14 dias sem cliente novo", () => {
    expect(
      situacaoDaCampanha(
        resumo({ id: "a", ultimoLeadEm: "2026-10-20T12:00:00Z" }),
        HOJE,
      ),
    ).toBe("no_ar");
    expect(
      situacaoDaCampanha(
        resumo({ id: "a", ultimoLeadEm: "2026-10-10T12:00:00Z" }),
        HOJE,
      ),
    ).toBe("encerrada");
  });
});

describe("filtro", () => {
  const lista = [
    resumo({ id: "com", gastoTotal: 100 }),
    resumo({ id: "sem", gastoTotal: null }),
    resumo({ id: "velha", gastoTotal: 50, ultimoLeadEm: "2026-09-01T12:00:00Z" }),
  ];

  it("sem gasto pega só quem não tem valor informado", () => {
    expect(
      lista.filter((r) => passaNoFiltro(r, "sem_gasto", HOJE)).map((r) => r.id),
    ).toEqual(["sem"]);
  });

  it("conta cada filtro", () => {
    expect(contarPorFiltro(lista, HOJE)).toEqual({
      todas: 3,
      no_ar: 2,
      sem_gasto: 1,
      encerradas: 1,
    });
  });
});

describe("ordenarCampanhas", () => {
  const a = resumo({
    id: "a",
    leads: 3,
    gastoTotal: 900,
    ultimoLeadEm: "2026-10-20T12:00:00Z",
  });
  const b = resumo({
    id: "b",
    leads: 30,
    gastoTotal: 300,
    ultimoLeadEm: "2026-10-25T12:00:00Z",
  });
  const vazia = resumo({
    id: "vazia",
    leads: 0,
    gastoTotal: null,
    ultimoLeadEm: "2026-10-28T12:00:00Z",
  });
  const semGasto = resumo({
    id: "semGasto",
    leads: 12,
    gastoTotal: null,
    ultimoLeadEm: "2026-10-10T12:00:00Z",
  });
  const todas = [a, b, vazia, semGasto];
  const ids = (l: ResumoImpulsionamento[]) => l.map((r) => r.id);

  it("recentes: pelo último cliente, e o anúncio vazio no fim mesmo sendo o mais novo", () => {
    expect(ids(ordenarCampanhas(todas, "recentes", []))).toEqual([
      "b",
      "a",
      "semGasto",
      "vazia",
    ]);
  });

  it("melhor: a ordem do comparativo primeiro, depois quem não disputa", () => {
    expect(ids(ordenarCampanhas(todas, "melhor", ["b", "a"]))).toEqual([
      "b",
      "a",
      "semGasto",
      "vazia",
    ]);
  });

  it("clientes e investimento", () => {
    expect(ids(ordenarCampanhas(todas, "clientes", []))).toEqual([
      "b",
      "semGasto",
      "a",
      "vazia",
    ]);
    expect(ids(ordenarCampanhas(todas, "investimento", []))).toEqual([
      "a",
      "b",
      "semGasto",
      "vazia",
    ]);
  });

  it("não muda a lista recebida", () => {
    const copia = [...todas];
    ordenarCampanhas(todas, "clientes", []);
    expect(todas).toEqual(copia);
  });
});

describe("visitaramDe", () => {
  it("porcentagem só com amostra", () => {
    expect(visitaramDe(resumo({ id: "x", leads: 12, visitas: 5 }))).toBe("5 · 42%");
    expect(visitaramDe(resumo({ id: "x", leads: 3, visitas: 1 }))).toBe("1 de 3");
    expect(visitaramDe(resumo({ id: "x", leads: 0 }))).toBe("0");
  });
});

import { describe, expect, it } from "vitest";
import { fimDoTesteGratis, situacaoDaCobranca } from "@/lib/planos/cobranca";
import { competenciaDoVencimento, inicioDaAssinatura } from "./assinatura";

/**
 * O primeiro vencimento da assinatura do Asaas (29/10/2026, 0241): tem de
 * cair na competência que o painel cobra, porque o webhook registra o
 * pagamento no mês do vencimento.
 */

const meioDia = (dia: string) => new Date(`${dia}T12:00:00-03:00`);

const BASE = {
  plano: "essencial",
  suspensoManual: false,
  criadoEm: "2026-08-10T15:00:00-03:00",
  diaDoVencimento: 10,
};

describe("inicioDaAssinatura", () => {
  it("em dia: começa no próximo vencimento do painel, sem mexer no dia", () => {
    const situacao = situacaoDaCobranca({ ...BASE, competenciasPagas: ["2026-08-01", "2026-09-01", "2026-10-01"], hoje: meioDia("2026-10-20") });
    expect(inicioDaAssinatura({ situacao, hoje: "2026-10-20", diaDoVencimento: 10 })).toEqual({
      proximoVencimento: "2026-11-10",
      novoDiaDoVencimento: null,
      atrasadasFora: [],
    });
  });

  it("antes do vencimento do mês: a primeira fatura é a deste mês", () => {
    const situacao = situacaoDaCobranca({ ...BASE, competenciasPagas: ["2026-08-01", "2026-09-01"], hoje: meioDia("2026-10-05") });
    expect(inicioDaAssinatura({ situacao, hoje: "2026-10-05", diaDoVencimento: 10 }).proximoVencimento).toBe("2026-10-10");
  });

  it("a competência do mês vencida: cobra hoje e o vencimento do grupo passa a ser o dia de hoje", () => {
    const situacao = situacaoDaCobranca({ ...BASE, competenciasPagas: ["2026-08-01", "2026-09-01"], hoje: meioDia("2026-10-13") });
    expect(inicioDaAssinatura({ situacao, hoje: "2026-10-13", diaDoVencimento: 10 })).toEqual({
      proximoVencimento: "2026-10-13",
      novoDiaDoVencimento: 13,
      atrasadasFora: [],
    });
  });

  it("no próprio dia do vencimento não muda o dia", () => {
    const situacao = situacaoDaCobranca({ ...BASE, competenciasPagas: ["2026-08-01", "2026-09-01"], hoje: meioDia("2026-10-10") });
    expect(inicioDaAssinatura({ situacao, hoje: "2026-10-10", diaDoVencimento: 10 }).novoDiaDoVencimento).toBeNull();
  });

  it("dia 30 vira 28 no vencimento do grupo (fevereiro cabe)", () => {
    const situacao = situacaoDaCobranca({ ...BASE, competenciasPagas: ["2026-08-01", "2026-09-01"], hoje: meioDia("2026-10-30") });
    expect(inicioDaAssinatura({ situacao, hoje: "2026-10-30", diaDoVencimento: 10 }).novoDiaDoVencimento).toBe(28);
  });

  it("meses anteriores em aberto ficam de fora (o Asaas não cobra para trás)", () => {
    const situacao = situacaoDaCobranca({ ...BASE, competenciasPagas: ["2026-08-01"], hoje: meioDia("2026-10-13") });
    expect(inicioDaAssinatura({ situacao, hoje: "2026-10-13", diaDoVencimento: 10 })).toEqual({
      proximoVencimento: "2026-10-13",
      novoDiaDoVencimento: 13,
      atrasadasFora: ["2026-09-01"],
    });
  });

  it("no teste grátis: a primeira fatura vence no fim do teste", () => {
    const inicio = new Date("2026-10-29T15:00:00-03:00");
    const situacao = situacaoDaCobranca({
      ...BASE,
      criadoEm: inicio.toISOString(),
      diaDoVencimento: 5,
      competenciasPagas: [],
      testeAte: fimDoTesteGratis(inicio).toISOString(),
      hoje: inicio,
    });
    expect(inicioDaAssinatura({ situacao, hoje: "2026-10-29", diaDoVencimento: 5 })).toEqual({
      proximoVencimento: "2026-11-05",
      novoDiaDoVencimento: null,
      atrasadasFora: [],
    });
  });

  it("teste acabado sem pagamento, no mesmo mês: cobra hoje, e o pagamento quita a competência do teste", () => {
    const inicio = new Date("2026-10-29T15:00:00-03:00");
    const situacao = situacaoDaCobranca({
      ...BASE,
      criadoEm: inicio.toISOString(),
      diaDoVencimento: 5,
      competenciasPagas: [],
      testeAte: fimDoTesteGratis(inicio).toISOString(),
      hoje: meioDia("2026-11-07"),
    });
    expect(situacao.estado).toBe("suspenso");
    const r = inicioDaAssinatura({ situacao, hoje: "2026-11-07", diaDoVencimento: 5 });
    expect(r).toEqual({ proximoVencimento: "2026-11-07", novoDiaDoVencimento: 7, atrasadasFora: [] });
    expect(competenciaDoVencimento(r.proximoVencimento)).toBe(situacao.competenciaEmAberto);
  });
});

describe("competenciaDoVencimento", () => {
  it("o mês do vencimento, dia 1", () => {
    expect(competenciaDoVencimento("2026-11-05")).toBe("2026-11-01");
    expect(competenciaDoVencimento("05/11/2026")).toBeNull();
    expect(competenciaDoVencimento("")).toBeNull();
  });
});

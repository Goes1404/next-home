import { describe, expect, it } from "vitest";
import { evolucaoNoRanking, fatiaDoCorretor, ordemDoPodio, type LinhaDoRankingGrafico } from "./graficosDoRanking";

const l = (corretorId: string, vgv: number): LinhaDoRankingGrafico => ({ corretorId, nome: corretorId.toUpperCase(), fotoUrl: null, vgv, vendas: 1 });

describe("ordemDoPodio", () => {
  it("2º, 1º, 3º", () => {
    expect(ordemDoPodio([l("a", 9), l("b", 8), l("c", 7), l("d", 6)]).map((x) => [x.linha.corretorId, x.posicao])).toEqual([
      ["b", 2],
      ["a", 1],
      ["c", 3],
    ]);
  });
  it("com dois, o 1º fica à direita do 2º; sem VGV não sobe ao pódio", () => {
    expect(ordemDoPodio([l("a", 9), l("b", 8), l("c", 0)]).map((x) => x.posicao)).toEqual([2, 1]);
    expect(ordemDoPodio([l("a", 0)])).toEqual([]);
  });
});

describe("fatiaDoCorretor", () => {
  it("fatia, quem está acima e quem vem atrás", () => {
    const f = fatiaDoCorretor([l("a", 600), l("eu", 300), l("c", 100)], "eu");
    expect(f).toEqual({ total: 1000, meu: 300, porcentagem: 30, posicao: 2, acima: { nome: "A", falta: 300 }, abaixo: { nome: "C", vantagem: 200 } });
  });
  it("líder não tem ninguém acima", () => {
    expect(fatiaDoCorretor([l("eu", 600), l("b", 100)], "eu").acima).toBeNull();
  });
  it("sem venda: o alvo é o último da lista", () => {
    const f = fatiaDoCorretor([l("a", 600), l("b", 100), l("eu", 0)], "eu");
    expect(f.posicao).toBeNull();
    expect(f.porcentagem).toBe(0);
    expect(f.acima).toEqual({ nome: "B", falta: 100 });
  });
  it("equipe sem VGV", () => {
    expect(fatiaDoCorretor([l("eu", 0)], "eu").porcentagem).toBeNull();
  });
});

describe("evolucaoNoRanking", () => {
  it("posição por mês, null quando não vendeu", () => {
    const e = evolucaoNoRanking(
      [
        { mes: "2026-09", ranking: [l("a", 5), l("eu", 3)] },
        { mes: "2026-10", ranking: [l("a", 5), l("eu", 0)] },
      ],
      "eu",
    );
    expect(e).toEqual([
      { mes: "2026-09", rotulo: "set", valor: 3, posicao: 2, participantes: 2 },
      { mes: "2026-10", rotulo: "out", valor: 0, posicao: null, participantes: 1 },
    ]);
  });
});

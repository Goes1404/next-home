import { describe, expect, it } from "vitest";
import {
  fracaoDoMes,
  lerMetaDigitada,
  montarPlacar,
  oQueFalta,
  placarDoCorretor,
  porcento,
  progressoDaMedida,
  progressoGeral,
  visitaConta,
  type Contagem,
  type MetasDoMes,
} from "./placarDaEquipe";

/** As contas do placar do mês (0246): progresso, empate e o recorte de privacidade. */

const metas = (v: number | null, p: number | null, s: number | null): MetasDoMes => ({ visitas: v, propostas: p, vendas: s });
const feito = (v: number, p: number, s: number): Contagem => ({ visitas: v, propostas: p, vendas: s });

describe("progresso", () => {
  it("cada medida: feito ÷ meta, sem teto; sem meta é nulo", () => {
    expect(progressoDaMedida(5, 10)).toBe(0.5);
    expect(progressoDaMedida(13, 10)).toBe(1.3);
    expect(progressoDaMedida(3, null)).toBeNull();
    expect(progressoDaMedida(3, 0)).toBeNull();
  });

  it("o geral é a média das medidas com meta, cada uma limitada a 100%", () => {
    // visitas 20/10 (200% → 100%), vendas 0/2 (0%): média 50%, não 100%.
    expect(progressoGeral(metas(10, null, 2), feito(20, 9, 0))).toBe(0.5);
    // Só uma medida com meta: ela é o geral.
    expect(progressoGeral(metas(null, 4, null), feito(0, 1, 0))).toBe(0.25);
    expect(progressoGeral(metas(null, null, null), feito(5, 5, 5))).toBeNull();
  });

  it("porcentagem arredonda para baixo: 99,6% não é meta batida", () => {
    expect(porcento(0.996)).toBe("99%");
    expect(porcento(1)).toBe("100%");
    expect(porcento(1.3)).toBe("130%");
    expect(porcento(null)).toBe("—");
  });

  it("o que falta, em trabalho", () => {
    expect(oQueFalta(metas(10, 3, 1), feito(8, 3, 0))).toBe("Faltam 2 visitas e 1 venda.");
    expect(oQueFalta(metas(10, 5, 2), feito(9, 1, 0))).toBe("Faltam 1 visita, 4 propostas e 2 vendas.");
    expect(oQueFalta(metas(10, null, null), feito(12, 0, 0))).toBeNull();
  });

  it("a marca do ritmo é a fração do mês corrida", () => {
    expect(fracaoDoMes("2026-10-31")).toBe(1);
    expect(fracaoDoMes("2026-02-14")).toBe(0.5);
  });
});

describe("o placar", () => {
  const equipe = [
    { id: "ana", nome: "Ana" },
    { id: "bia", nome: "Bia" },
    { id: "caio", nome: "Caio" },
    { id: "davi", nome: "Davi" },
  ];
  const metasDoMes = new Map([
    ["ana", metas(10, 4, 2)],
    ["bia", metas(10, 4, 2)],
    ["caio", metas(10, null, null)],
  ]);
  const feitos = new Map([
    ["ana", feito(5, 2, 1)], // 50%
    ["bia", feito(10, 4, 2)], // 100%
    ["caio", feito(5, 9, 9)], // 50% (só visitas tem meta)
    ["davi", feito(30, 9, 9)], // sem meta
  ]);

  it("ordena pelo geral, desempata por vendas, e quem não tem meta vai ao fim sem posição", () => {
    const placar = montarPlacar(equipe, metasDoMes, feitos);
    expect(placar.map((l) => [l.corretorId, l.posicao])).toEqual([
      ["bia", 1],
      ["caio", 2], // empata com Ana em 50%, mas tem mais vendas
      ["ana", 3],
      ["davi", null],
    ]);
    expect(placar[0].bateu).toBe(true);
    expect(placar[1].porMedida).toEqual({ visitas: 0.5, propostas: null, vendas: null });
  });

  it("quem não tem linha de feito começa do zero", () => {
    const placar = montarPlacar([{ id: "eva", nome: "Eva" }], new Map([["eva", metas(5, null, null)]]), new Map());
    expect(placar[0]).toMatchObject({ geral: 0, posicao: 1, bateu: false, feito: { visitas: 0, propostas: 0, vendas: 0 } });
  });

  it("o corretor vê o pódio sem os números dos colegas, e a própria linha inteira", () => {
    const placar = montarPlacar(equipe, metasDoMes, feitos);
    const visto = placarDoCorretor(placar, "ana", 2);
    expect(visto.participantes).toBe(3);
    expect(visto.podio.map((l) => l.corretorId)).toEqual(["bia", "caio"]);
    for (const linha of visto.podio) {
      expect(linha).not.toHaveProperty("feito");
      expect(linha).not.toHaveProperty("metas");
    }
    expect(visto.minha).toMatchObject({ corretorId: "ana", posicao: 3, feito: { visitas: 5 } });
  });

  it("corretor sem meta vê o pódio e a própria linha sem posição", () => {
    const visto = placarDoCorretor(montarPlacar(equipe, metasDoMes, feitos), "davi");
    expect(visto.minha?.posicao).toBeNull();
    expect(visto.podio).toHaveLength(3);
  });
});

describe("o que entra na conta", () => {
  const agora = new Date("2026-10-29T15:00:00Z");

  it("visita conta se aconteceu, ou se está marcada e o horário já passou", () => {
    expect(visitaConta({ status: "realizada", inicio: "2026-10-01T13:00:00Z" }, agora)).toBe(true);
    expect(visitaConta({ status: "marcada", inicio: "2026-10-29T13:00:00Z" }, agora)).toBe(true);
    expect(visitaConta({ status: "marcada", inicio: "2026-10-30T13:00:00Z" }, agora)).toBe(false);
    for (const status of ["cancelada", "faltou", "sem_confirmacao"]) {
      expect(visitaConta({ status, inicio: "2026-10-01T13:00:00Z" }, agora)).toBe(false);
    }
  });

  it("a meta digitada: vazio ou zero é sem meta; inteiro de 1 a 1000", () => {
    expect(lerMetaDigitada("")).toBeNull();
    expect(lerMetaDigitada("0")).toBeNull();
    expect(lerMetaDigitada(" 12 ")).toBe(12);
    expect(lerMetaDigitada(1000)).toBe(1000);
    expect(lerMetaDigitada("1001")).toBe("invalida");
    expect(lerMetaDigitada("2.5")).toBe("invalida");
    expect(lerMetaDigitada("-3")).toBe("invalida");
  });
});

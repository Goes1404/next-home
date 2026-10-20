import { describe, expect, it } from "vitest";
import { PLANOS } from "@/lib/plataforma/rotulosDoGrupo";
import {
  LIMIAR_DE_AVISO,
  RESPOSTAS_DA_IA_POR_MES,
  inicioDoProximoMesEmSaoPaulo,
  mesEmSaoPaulo,
  situacaoDaCota,
  tetoDeRespostasDaIa,
} from "./cotaDaIa";

describe("teto de respostas da IA", () => {
  it("todo plano tem um número (ou nenhum) declarado", () => {
    expect(Object.keys(RESPOSTAS_DA_IA_POR_MES).sort()).toEqual([...PLANOS].sort());
  });

  it("segue o plano quando a plataforma não ajustou", () => {
    expect(tetoDeRespostasDaIa({ plano: "essencial", tetoAjustado: null, assentos: 3 })).toBe(1000);
    expect(tetoDeRespostasDaIa({ plano: "profissional", tetoAjustado: null, assentos: 3 })).toBe(2000);
  });

  it("Imobiliária soma por assento, com pelo menos um", () => {
    expect(tetoDeRespostasDaIa({ plano: "imobiliaria", tetoAjustado: null, assentos: 4 })).toBe(6000);
    expect(tetoDeRespostasDaIa({ plano: "imobiliaria", tetoAjustado: null, assentos: 0 })).toBe(1500);
  });

  it("Preço de custo (Next Home) não tem teto", () => {
    expect(tetoDeRespostasDaIa({ plano: "custo", tetoAjustado: null, assentos: 9 })).toBeNull();
  });

  it("o ajuste da plataforma vence o plano, inclusive o de custo", () => {
    expect(tetoDeRespostasDaIa({ plano: "essencial", tetoAjustado: 50, assentos: 1 })).toBe(50);
    expect(tetoDeRespostasDaIa({ plano: "custo", tetoAjustado: 300, assentos: 1 })).toBe(300);
    expect(tetoDeRespostasDaIa({ plano: "essencial", tetoAjustado: 0, assentos: 1 })).toBe(0);
  });
});

describe("mês de São Paulo", () => {
  it("às 22h do último dia em Brasília o mês ainda não virou (o servidor já está no dia 1º em UTC)", () => {
    const agora = new Date("2026-11-01T01:00:00Z"); // 31/10 22h em SP
    expect(mesEmSaoPaulo(agora)).toBe("2026-10-01");
    expect(inicioDoProximoMesEmSaoPaulo(agora).toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("vira a dezembro → janeiro", () => {
    const agora = new Date("2026-12-15T12:00:00Z");
    expect(mesEmSaoPaulo(agora)).toBe("2026-12-01");
    expect(inicioDoProximoMesEmSaoPaulo(agora).toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});

describe("situação da cota", () => {
  it("sem teto nunca esgota nem avisa", () => {
    expect(situacaoDaCota({ respostas: 99999, teto: null }).nivel).toBe("sem_teto");
  });

  it("abaixo de 80% está livre", () => {
    expect(situacaoDaCota({ respostas: 799, teto: 1000 }).nivel).toBe("livre");
  });

  it(`a partir de ${LIMIAR_DE_AVISO * 100}% avisa`, () => {
    const s = situacaoDaCota({ respostas: 800, teto: 1000 });
    expect(s.nivel).toBe("aviso");
    expect(s.percentual).toBe(80);
    expect(s.restantes).toBe(200);
  });

  it("no teto esgota, e não fica negativo além dele", () => {
    expect(situacaoDaCota({ respostas: 1000, teto: 1000 }).nivel).toBe("esgotada");
    const passou = situacaoDaCota({ respostas: 1002, teto: 1000 });
    expect(passou.nivel).toBe("esgotada");
    expect(passou.restantes).toBe(0);
  });

  it("teto zero esgota já na primeira", () => {
    expect(situacaoDaCota({ respostas: 0, teto: 0 }).nivel).toBe("esgotada");
  });
});

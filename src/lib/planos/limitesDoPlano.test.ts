import { describe, expect, it } from "vitest";
import {
  cabeNoLimite,
  fraseDoQueResta,
  lerLimiteDigitado,
  mensagemDeRecusa,
  situacaoDoRecurso,
  situacaoLivre,
  tetoDoRecurso,
  type Recurso,
} from "./limitesDoPlano";

const sem = { tetoAjustado: null, assentos: 1 };

describe("tetoDoRecurso", () => {
  it("segue a tabela do plano", () => {
    expect(tetoDoRecurso({ recurso: "arte", plano: "essencial", ...sem })).toBe(30);
    expect(tetoDoRecurso({ recurso: "video", plano: "essencial", ...sem })).toBe(3);
    expect(tetoDoRecurso({ recurso: "lista", plano: "essencial", ...sem })).toBe(1000);
    expect(tetoDoRecurso({ recurso: "arte", plano: "profissional", ...sem })).toBe(100);
    expect(tetoDoRecurso({ recurso: "video", plano: "profissional", ...sem })).toBe(10);
    expect(tetoDoRecurso({ recurso: "lista", plano: "profissional", ...sem })).toBe(2500);
  });

  it("imobiliária: artes e vídeos por assento, lista por imobiliária", () => {
    const base = { plano: "imobiliaria" as const, tetoAjustado: null };
    expect(tetoDoRecurso({ ...base, recurso: "arte", assentos: 4 })).toBe(200);
    expect(tetoDoRecurso({ ...base, recurso: "video", assentos: 4 })).toBe(20);
    expect(tetoDoRecurso({ ...base, recurso: "lista", assentos: 4 })).toBe(2500);
    // Sem número cadastrado ainda conta um assento.
    expect(tetoDoRecurso({ ...base, recurso: "arte", assentos: 0 })).toBe(50);
  });

  it("o ajuste da plataforma vence o plano e não multiplica por assento", () => {
    expect(tetoDoRecurso({ recurso: "arte", plano: "imobiliaria", tetoAjustado: 7, assentos: 9 })).toBe(7);
    expect(tetoDoRecurso({ recurso: "video", plano: "essencial", tetoAjustado: 0, assentos: 1 })).toBe(0);
    expect(tetoDoRecurso({ recurso: "lista", plano: "custo", tetoAjustado: 300, assentos: 1 })).toBe(300);
  });

  it("plano a preço de custo (Next Home) não tem teto em nada", () => {
    for (const recurso of ["arte", "video", "lista"] as Recurso[]) {
      expect(tetoDoRecurso({ recurso, plano: "custo", tetoAjustado: null, assentos: 12 })).toBeNull();
    }
  });
});

describe("situacaoDoRecurso", () => {
  it("livre, aviso a partir de 80% e esgotada", () => {
    const s = (usados: number) => situacaoDoRecurso({ recurso: "arte", usados, teto: 30 });
    expect(s(23).nivel).toBe("livre");
    expect(s(24).nivel).toBe("aviso");
    expect(s(29)).toMatchObject({ nivel: "aviso", restantes: 1 });
    expect(s(30)).toMatchObject({ nivel: "esgotada", restantes: 0, percentual: 100 });
    expect(s(31)).toMatchObject({ nivel: "esgotada", restantes: 0 });
  });

  it("sem teto nunca avisa nem esgota", () => {
    const s = situacaoDoRecurso({ recurso: "lista", usados: 1_000_000, teto: null });
    expect(s).toMatchObject({ nivel: "sem_teto", restantes: null, percentual: null });
    expect(cabeNoLimite(s, 50_000)).toBe(true);
    expect(mensagemDeRecusa(s, 50_000)).toBeNull();
    expect(fraseDoQueResta(s)).toBeNull();
  });

  it("teto zero já nasce esgotado", () => {
    expect(situacaoDoRecurso({ recurso: "video", usados: 0, teto: 0 }).nivel).toBe("esgotada");
  });
});

describe("recusa", () => {
  it("arte esgotada diz o plano, que voltam no dia 1º e como pedir mais", () => {
    const s = situacaoDoRecurso({ recurso: "arte", usados: 30, teto: 30 });
    expect(cabeNoLimite(s)).toBe(false);
    const m = mensagemDeRecusa(s) ?? "";
    expect(m).toContain("Seu plano tem 30 artes por mês e elas acabaram. Voltam no dia 1º.");
    expect(m).toContain("Para pedir mais");
  });

  it("vídeo esgotado concorda no gênero", () => {
    const m = mensagemDeRecusa(situacaoDoRecurso({ recurso: "video", usados: 3, teto: 3 })) ?? "";
    expect(m).toContain("3 vídeos por mês e eles acabaram");
  });

  it("lista maior que o restante é recusada inteira, com a conta", () => {
    const s = situacaoDoRecurso({ recurso: "lista", usados: 900, teto: 1000 });
    expect(cabeNoLimite(s, 100)).toBe(true);
    expect(cabeNoLimite(s, 101)).toBe(false);
    const m = mensagemDeRecusa(s, 150) ?? "";
    expect(m).toContain("150 mensagens de lista");
    expect(m).toContain("restam 100");
    expect(m).toContain("900 de 1.000");
  });
});

describe("fraseDoQueResta", () => {
  it("fala o que resta", () => {
    expect(fraseDoQueResta(situacaoDoRecurso({ recurso: "arte", usados: 18, teto: 30 }))).toBe("Restam 12 artes este mês.");
    expect(fraseDoQueResta(situacaoDoRecurso({ recurso: "video", usados: 2, teto: 3 }))).toBe("Resta 1 vídeo este mês.");
    expect(fraseDoQueResta(situacaoDoRecurso({ recurso: "arte", usados: 30, teto: 30 }))).toContain("acabaram");
  });
});

describe("situacaoLivre e lerLimiteDigitado", () => {
  it("falha de leitura vira livre", () => {
    expect(situacaoLivre("arte").nivel).toBe("sem_teto");
  });

  it("aceita milhar, branco e recusa lixo", () => {
    expect(lerLimiteDigitado("", "arte")).toEqual({ ok: true, teto: null });
    expect(lerLimiteDigitado("2.500", "lista")).toEqual({ ok: true, teto: 2500 });
    expect(lerLimiteDigitado("10,5", "video").ok).toBe(false);
    expect(lerLimiteDigitado("-3", "arte").ok).toBe(false);
    expect(lerLimiteDigitado("9999999", "arte").ok).toBe(false);
  });
});

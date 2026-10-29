import { describe, expect, it } from "vitest";
import { LINHAS_PADRAO, parametrosNaData } from "./parametrosFiscais";

describe("parametrosNaData", () => {
  it("dezembro de 2025: teto antigo e sem o redutor da Lei 15.270", () => {
    const p = parametrosNaData(LINHAS_PADRAO, "2025-12-15");
    expect(p.tetoInss).toBe(8157.41);
    expect(p.redutor).toBeNull();
  });

  it("a partir de 01/01/2026: teto novo e o redutor", () => {
    const p = parametrosNaData(LINHAS_PADRAO, "2026-01-01");
    expect(p.tetoInss).toBe(8475.55);
    expect(p.redutor).toEqual({ isentoAte: 5000, ate: 7350, a: 978.62, b: 0.133145 });
  });

  it("as faixas do IRRF de 2026 são as vigentes desde maio de 2025", () => {
    expect(parametrosNaData(LINHAS_PADRAO, "2026-03-10").faixasIrrf).toEqual([
      { ate: 2428.8, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
    ]);
  });

  it("parâmetro faltando é erro, não zero calado", () => {
    const semTeto = LINHAS_PADRAO.filter((l) => l.chave !== "inss_teto");
    expect(() => parametrosNaData(semTeto, "2026-03-10")).toThrow("parametro_fiscal_ausente:inss_teto");
  });

  it("todo parâmetro vigente diz de onde veio", () => {
    const p = parametrosNaData(LINHAS_PADRAO, "2026-03-10");
    expect(p.origem).toHaveLength(6);
    for (const o of p.origem) expect(o.fonte.trim()).not.toBe("");
  });
});

// Revisão final: antes de 05/2025 não há linha vigente de IRRF, e a tela
// Fiscal de um mês antigo virava página de erro.
describe("parametrosNaData antes da primeira vigência", () => {
  it("usa a linha mais antiga de cada chave e diz isso na fonte", () => {
    const p = parametrosNaData(LINHAS_PADRAO, "2024-12-15");
    expect(p.tetoInss).toBe(8157.41);
    expect(p.faixasIrrf).toHaveLength(5);
    const faixas = p.origem.find((o) => o.chave === "irrf_faixas")!;
    expect(faixas.fonte).toMatch(/anterior/i);
  });
});

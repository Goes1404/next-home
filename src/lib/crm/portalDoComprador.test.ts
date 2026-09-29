import { describe, expect, it } from "vitest";
import { marcosDoComprador, ultimoPercentual } from "./portalDoComprador";

describe("portal do comprador", () => {
  it("marcos seguem o que o banco sabe, sem inventar data", () => {
    const m = marcosDoComprador({
      etapa: "fechado",
      documentosEnviados: 3,
      dataVenda: "2026-09-10",
      statusObra: "em_construcao",
      entregaPrevista: null,
      percentualObra: 45,
    });
    expect(m.map((x) => x.feito)).toEqual([true, true, false, false]);
    expect(m[1].detalhe).toBe("Em 10/09/2026");
    expect(m[2].detalhe).toBe("45% concluída");
    expect(m[3].detalhe).toMatch(/corretor avisa/);
  });
  it("o percentual é o da atualização mais recente que o informou", () => {
    expect(ultimoPercentual([{ percentual: null }, { percentual: 60 }, { percentual: 40 }])).toBe(60);
    expect(ultimoPercentual([])).toBeNull();
  });
});

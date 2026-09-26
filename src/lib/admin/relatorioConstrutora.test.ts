import { describe, expect, it } from "vitest";
import { linhasDoRelatorio, periodoDoRelatorio, totaisDoRelatorio } from "./relatorioConstrutora";

describe("relatório por construtora", () => {
  const imoveis = [
    { id: "a", nome: "Vitra" },
    { id: "b", nome: "Eternity" },
  ];

  it("visita conta pela data OU pela etapa; lead de outro imóvel fica fora", () => {
    const linhas = linhasDoRelatorio(
      imoveis,
      [
        { empreendimentoId: "a", etapa: "novo", visitaAgendadaEm: null },
        { empreendimentoId: "a", etapa: "primeiro_contato", visitaAgendadaEm: "2026-09-01" },
        { empreendimentoId: "a", etapa: "documentacao", visitaAgendadaEm: null },
        { empreendimentoId: "x", etapa: "fechado", visitaAgendadaEm: null },
      ],
      [{ empreendimentoId: "a", valor: 480000 }],
    );
    expect(linhas[0]).toEqual({ empreendimentoId: "a", nome: "Vitra", leads: 3, visitas: 2, vendas: 1, vgv: 480000 });
    expect(linhas[1].leads).toBe(0);
    expect(totaisDoRelatorio(linhas)).toEqual({ leads: 3, visitas: 2, vendas: 1, vgv: 480000 });
  });

  it("período fora da lista cai em 90 dias", () => {
    expect(periodoDoRelatorio("180")).toBe(180);
    expect(periodoDoRelatorio("7")).toBe(90);
    expect(periodoDoRelatorio(undefined)).toBe(90);
  });
});

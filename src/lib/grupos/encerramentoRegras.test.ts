import { describe, expect, it } from "vitest";
import {
  BUCKET_DAS_EXPORTACOES,
  DIAS_DE_RETENCAO,
  apagarEm,
  caminhoDaCopia,
  diasAteApagar,
  podeCancelar,
  rotinaDeApagarLigada,
  venceuARetencao,
} from "./encerramentoRegras";
import { GRUPO_NEXT_HOME_ID } from "./grupo";

const CANCELADO = "2026-07-01T15:00:00Z";

describe("regras do encerramento do grupo", () => {
  it("guarda os dados por 90 dias (resposta 7 do dono)", () => {
    expect(DIAS_DE_RETENCAO).toBe(90);
    expect(apagarEm(CANCELADO).toISOString()).toBe("2026-09-29T15:00:00.000Z");
  });

  it("só vence depois dos 90 dias, nunca antes", () => {
    expect(venceuARetencao(CANCELADO, new Date("2026-09-29T14:59:59Z"))).toBe(false);
    expect(venceuARetencao(CANCELADO, new Date("2026-09-29T15:00:00Z"))).toBe(true);
    expect(venceuARetencao(null, new Date("2030-01-01T00:00:00Z"))).toBe(false);
  });

  it("conta os dias que faltam, arredondando para cima e sem passar de zero", () => {
    expect(diasAteApagar(CANCELADO, new Date("2026-07-01T15:00:00Z"))).toBe(90);
    expect(diasAteApagar(CANCELADO, new Date("2026-09-29T03:00:00Z"))).toBe(1);
    expect(diasAteApagar(CANCELADO, new Date("2026-12-01T00:00:00Z"))).toBe(0);
  });

  it("a rotina só apaga com a variável ligada em 1, nada mais", () => {
    expect(rotinaDeApagarLigada({})).toBe(false);
    expect(rotinaDeApagarLigada({ APAGAR_GRUPOS_CANCELADOS: "true" })).toBe(false);
    expect(rotinaDeApagarLigada({ APAGAR_GRUPOS_CANCELADOS: "0" })).toBe(false);
    expect(rotinaDeApagarLigada({ APAGAR_GRUPOS_CANCELADOS: " 1 " })).toBe(true);
  });

  it("a Next Home não pode ser cancelada", () => {
    expect(podeCancelar(GRUPO_NEXT_HOME_ID)).toBe(false);
    expect(podeCancelar("4f6c2b1e-1111-4222-8333-944455556666")).toBe(true);
  });

  it("a cópia mora na pasta do grupo, no bucket privado", () => {
    expect(BUCKET_DAS_EXPORTACOES).toBe("exportacoes-de-grupos");
    expect(caminhoDaCopia("g1", new Date("2026-10-21T02:00:00Z"))).toBe("g1/final-2026-10-20.xlsx");
  });
});

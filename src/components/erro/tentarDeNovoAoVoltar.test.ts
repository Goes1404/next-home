import { beforeEach, describe, expect, it } from "vitest";
import { podeTentar } from "./tentarDeNovoAoVoltar";

// Sem jsdom no projeto: um sessionStorage de mentira basta para a regra do limite.
const guardado = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: {
    getItem: (k: string) => guardado.get(k) ?? null,
    setItem: (k: string, v: string) => void guardado.set(k, v),
  },
};

describe("tela de erro tenta de novo sozinha, com limite (20/11/2026)", () => {
  beforeEach(() => guardado.clear());

  it("tenta no máximo 2 vezes a cada 30 s no mesmo endereço", () => {
    expect(podeTentar(1_000, "/plataforma/prospeccao")).toBe(true);
    expect(podeTentar(2_000, "/plataforma/prospeccao")).toBe(true);
    expect(podeTentar(3_000, "/plataforma/prospeccao")).toBe(false);
    expect(podeTentar(3_000, "/plataforma")).toBe(true);
    expect(podeTentar(32_000, "/plataforma/prospeccao")).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";

/**
 * A retenção do central só apaga o TEXTO dos comandos antigos (a linha fica
 * para custo e acerto) e só as tentativas com mais de 30 dias.
 */

type Chamada = { tabela: string; passos: [string, unknown[]][] };
const chamadas: Chamada[] = [];

function consulta(tabela: string) {
  const c: Chamada = { tabela, passos: [] };
  chamadas.push(c);
  const corrente: Record<string, unknown> = {};
  for (const m of ["update", "delete", "lt", "not", "select"]) {
    corrente[m] = (...args: unknown[]) => {
      c.passos.push([m, args]);
      return m === "select" ? Promise.resolve({ data: [{ id: 1 }, { id: 2 }], error: null }) : corrente;
    };
  }
  return corrente;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: consulta }) }));

const { limparRegistroDoCentral } = await import("./retencao");

describe("limparRegistroDoCentral", () => {
  it("anula o texto dos comandos e apaga as tentativas, com corte de 30 dias", async () => {
    const r = await limparRegistroDoCentral(new Date("2026-10-31T12:00:00Z"));
    expect(r).toEqual({ textos: 2, tentativas: 2 });

    const comandos = chamadas.find((c) => c.tabela === "central_comandos")!;
    expect(comandos.passos[0]).toEqual(["update", [{ texto: null }]]);
    expect(comandos.passos).toContainEqual(["lt", ["created_at", "2026-10-01T12:00:00.000Z"]]);
    expect(comandos.passos.some(([m]) => m === "delete")).toBe(false);

    const tentativas = chamadas.find((c) => c.tabela === "central_tentativas")!;
    expect(tentativas.passos[0]).toEqual(["delete", []]);
    expect(tentativas.passos).toContainEqual(["lt", ["created_at", "2026-10-01T12:00:00.000Z"]]);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * A prova do incidente de 10/09/2026, reproduzida.
 *
 * Não basta a retentativa funcionar isolada: o que quebrou foi a HOME, e o que
 * precisa ficar travado é que uma piscada do banco no meio das leituras dela
 * não vire 500 para o visitante. Este teste finge o `Gateway Timeout` na
 * PRIMEIRA chamada de cada consulta e afirma que `getCorretores` ainda devolve
 * a equipe — que foi exatamente a função que apareceu no log da falha
 * ("Falha ao listar corretores: Gateway Timeout", rota `/`).
 */

const chamadas = { corretores: 0 };

vi.mock("@/lib/corretorAtivo", () => ({ getCorretorAtivo: async () => null }));

vi.mock("@/lib/supabase/public", () => ({
  createClient: () => ({
    from: () => {
      const resultado = () => {
        chamadas.corretores += 1;
        // Só a primeira falha, como no incidente: as requisições seguintes
        // passaram normalmente.
        return chamadas.corretores === 1
          ? { data: null, error: { message: "Gateway Timeout" } }
          : { data: [{ id: "1", nome: "Bruna", slug: "bruna" }], error: null };
      };
      const construtor: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "order", "maybeSingle"]) {
        construtor[m] = () => construtor;
      }
      construtor.then = (r: (v: unknown) => unknown) => Promise.resolve(resultado()).then(r);
      return construtor;
    },
  }),
}));

beforeEach(() => {
  chamadas.corretores = 0;
});

describe("a piscada do banco não derruba a home", () => {
  it("getCorretores sobrevive a UM Gateway Timeout", async () => {
    const { getCorretores } = await import("@/lib/queries");
    const equipe = await getCorretores();

    expect(chamadas.corretores).toBe(2);
    expect(equipe).toHaveLength(1);
  });
});

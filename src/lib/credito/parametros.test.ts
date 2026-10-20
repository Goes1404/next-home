import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Taxas de crédito por grupo (0190, decisão de 19/10/2026).
 *
 * Duas coisas podem dar errado caladas: ler a linha sem dizer de que grupo
 * (com dois grupos, `maybeSingle` erra ou devolve a de outro grupo) e a
 * chave do cache não levar o grupo (o primeiro grupo a abrir a tela serviria
 * as taxas dele a todos os outros por uma hora).
 */

const chavesDoCache: string[][] = [];
let filtros: [string, unknown][] = [];

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown, chave: string[]) => {
    chavesDoCache.push(chave);
    return fn;
  },
}));

vi.mock("@/lib/supabase/public", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: (coluna: string, valor: unknown) => {
          filtros.push([coluna, valor]);
          return {
            maybeSingle: async () => ({
              data: {
                faixas: [],
                teto_fgts_imovel: "350000",
                taxa_sbpe_anual: "0.1149",
                prazo_maximo_meses: 420,
                comprometimento_maximo: "0.30",
                itbi_por_cidade: {},
                conferido_em: "2026-09-09",
              },
              error: null,
            }),
          };
        },
      }),
    }),
  }),
}));

const { getParametrosCredito } = await import("./parametros");

describe("getParametrosCredito", () => {
  beforeEach(() => {
    chavesDoCache.length = 0;
    filtros = [];
  });

  it("lê a linha do grupo pedido", async () => {
    const p = await getParametrosCredito("grupo-b");
    expect(filtros).toEqual([["grupo_id", "grupo-b"]]);
    expect(p.taxaSbpeAnual).toBe(0.1149);
  });

  it("a chave do cache leva o grupo", async () => {
    await getParametrosCredito("grupo-a");
    await getParametrosCredito("grupo-b");
    expect(chavesDoCache).toEqual([
      ["parametros-credito", "grupo-a"],
      ["parametros-credito", "grupo-b"],
    ]);
  });
});

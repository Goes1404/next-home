import { describe, expect, it, vi } from "vitest";

/**
 * O endereço só do CRM abre as páginas de token do cliente (proxy.ts), então
 * a casca do segmento precisa de um "site" para ele: neutro, sem a marca da
 * Next Home. Qualquer outro host sem grupo continua dando 404.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./resolver", () => ({ resolverSite: async () => null }));

const { siteDaPagina, GRUPO_DO_ENDERECO_DO_PAINEL } = await import("./pagina");
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");

describe("siteDaPagina no endereço só do painel", () => {
  it("devolve um site neutro, que não é o da Next Home", async () => {
    const s = await siteDaPagina({ site: "astroimob.vercel.app" });
    expect(s.grupoId).toBe(GRUPO_DO_ENDERECO_DO_PAINEL);
    expect(s.grupoId).not.toBe(GRUPO_NEXT_HOME_ID);
    expect(s.marca.ehNextHome).toBe(false);
    expect(s.marca.url).toBe("");
    expect(s.marca.whatsapp).toEqual([]);
    expect(s.marca.endereco).toBeNull();
    expect(Object.values(s.marca).map((v) => JSON.stringify(v)).join(" ")).not.toMatch(/Next ?Home|nexthome/i);
  });

  it("host sem grupo que não é do painel continua dando 404", async () => {
    await expect(siteDaPagina({ site: "desconhecido.com.br" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

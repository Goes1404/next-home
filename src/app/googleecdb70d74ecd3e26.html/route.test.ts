import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sites/resolver", async () => {
  const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");
  return {
    resolverSite: async (host: string | null) =>
      host === "www.nexthomeimoveis.com"
        ? { grupoId: GRUPO_NEXT_HOME_ID, host }
        : host === "imobiliariab.com.br"
          ? { grupoId: "00000000-0000-0000-0000-00000000000b", host }
          : null,
  };
});

const { GET } = await import("./route");

const pedir = (host: string) =>
  GET(new Request(`https://${host}/googleecdb70d74ecd3e26.html`, { headers: { host } }));

describe("verificação do Search Console da Next Home", () => {
  it("só o site da Next Home a responde", async () => {
    const r = await pedir("www.nexthomeimoveis.com");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("google-site-verification: googleecdb70d74ecd3e26.html");
    expect((await pedir("imobiliariab.com.br")).status).toBe(404);
    expect((await pedir("naoexiste.com.br")).status).toBe(404);
  });
});

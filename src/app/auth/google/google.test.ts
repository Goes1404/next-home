import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Entrar com Google" (29/10/2026): Google é só um jeito de ENTRAR. Quem não
 * tem conta da Astro sai, e o usuário que o Supabase acabou de criar só com
 * a identidade Google é apagado.
 */

let troca: { data: { user: unknown }; error: unknown };
let ficha: { id: string; ativo: boolean } | null;
let ehAdmin: boolean;
let saiu: boolean;
const apagados: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => troca,
      signOut: async () => {
        saiu = true;
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ficha }) }) }) }),
    rpc: async () => ({ data: ehAdmin }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { deleteUser: async (id: string) => apagados.push(id) } } }),
}));

const { GET } = await import("./route");

function pedir(query: string) {
  const url = new URL(`https://astroimob.vercel.app/auth/google${query}`);
  return GET({ nextUrl: url } as never);
}

const usuario = (extra: Record<string, unknown> = {}) => ({
  id: "u1",
  created_at: new Date().toISOString(),
  identities: [{ provider: "google" }],
  ...extra,
});

beforeEach(() => {
  troca = { data: { user: usuario() }, error: null };
  ficha = { id: "c1", ativo: true };
  ehAdmin = false;
  saiu = false;
  apagados.length = 0;
});

describe("volta do Google", () => {
  it("sem code, volta ao login com aviso", async () => {
    expect((await pedir("")).headers.get("Location")).toBe("/corretor/entrar?google=falhou");
  });

  it("corretor com ficha ativa entra; next fora da régua vira /corretor", async () => {
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/corretor");
    expect((await pedir("?code=x&next=/corretor/leads")).headers.get("Location")).toBe("/corretor/leads");
    expect((await pedir("?code=x&next=https://mal.com")).headers.get("Location")).toBe("/corretor");
  });

  it("administrador da plataforma sem ficha vai para /plataforma", async () => {
    ficha = null;
    ehAdmin = true;
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/plataforma");
  });

  it("Google sem conta: sai e apaga o usuário recém-criado só com Google", async () => {
    ficha = null;
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/corretor/entrar?google=sem-conta");
    expect(saiu).toBe(true);
    expect(apagados).toEqual(["u1"]);
  });

  it("conta antiga com senha (não só Google) nunca é apagada", async () => {
    ficha = null;
    troca = { data: { user: usuario({ identities: [{ provider: "email" }, { provider: "google" }] }) }, error: null };
    await pedir("?code=x");
    expect(apagados).toEqual([]);
  });

  it("corretor desativado não entra pelo Google e a conta dele fica", async () => {
    ficha = { id: "c1", ativo: false };
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/corretor/entrar?google=sem-conta");
    expect(apagados).toEqual([]);
  });
});

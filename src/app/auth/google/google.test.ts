import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Entrar com Google" (29/10/2026): Google é só um jeito de ENTRAR. Quem não
 * tem conta da Astro sai, e o usuário que o Supabase acabou de criar só com
 * a identidade Google é apagado.
 */

let troca: { data: { user: unknown }; error: unknown };
let ficha: { id: string; ativo: boolean; deve_trocar_senha?: boolean } | null;
const datasRegistradas: string[] = [];
let renovou: number;
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
      refreshSession: async () => {
        renovou++;
      },
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ficha }) }) }) }),
    rpc: async () => ({ data: ehAdmin }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ auth: { admin: { deleteUser: async (id: string) => apagados.push(id) } } }),
}));

vi.mock("@/lib/auth/validadeDaSenhaNoServidor", () => ({
  DESTINO_SENHA_VENCIDA: "/corretor/senha?motivo=vencida",
  registrarSenhaTrocada: async (id: string) => {
    datasRegistradas.push(id);
  },
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
  datasRegistradas.length = 0;
  renovou = 0;
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

describe("senha de quem entra com o Google (revisão de 30/10/2026)", () => {
  const recente = new Date().toISOString();

  it("sem data da troca, começa os 90 dias e renova a sessão", async () => {
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/corretor");
    expect(datasRegistradas).toEqual(["u1"]);
    expect(renovou).toBe(1);
  });

  it("com data recente, não regrava; vencida vai para a troca", async () => {
    troca = { data: { user: usuario({ app_metadata: { senha_trocada_em: recente } }) }, error: null };
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/corretor");
    expect(datasRegistradas).toEqual([]);
    troca = { data: { user: usuario({ app_metadata: { senha_trocada_em: "2020-01-01T00:00:00Z" } }) }, error: null };
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/corretor/senha?motivo=vencida");
  });

  it("troca obrigatória pela ficha ou, sem ficha, pelo app_metadata", async () => {
    troca = { data: { user: usuario({ app_metadata: { senha_trocada_em: recente } }) }, error: null };
    ficha = { id: "c1", ativo: true, deve_trocar_senha: true };
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/corretor/senha");
    ficha = null;
    ehAdmin = true;
    troca = {
      data: { user: usuario({ app_metadata: { senha_trocada_em: recente, deve_trocar_senha: true } }) },
      error: null,
    };
    expect((await pedir("?code=x")).headers.get("Location")).toBe("/corretor/senha");
  });
});

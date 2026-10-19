import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Quem chega pelo link do convite ou da recuperação já tem sessão (o
 * `/auth/confirmar` abriu), mas não tem senha que conheça: a tela não pede a
 * atual — é a diferença para `trocarSenha`.
 */

let usuario: { id: string; email: string } | null = { id: "usuario-1", email: "ana@exemplo.com.br" };
let erroDoUpdateUser: unknown = null;
const senhasGravadas: unknown[] = [];
const updatesDeCorretores: { valores: unknown; coluna: string; valor: unknown }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: usuario }, error: null }),
      updateUser: async (attrs: unknown) => {
        senhasGravadas.push(attrs);
        return { data: {}, error: erroDoUpdateUser };
      },
    },
    from: (tabela: string) => {
      expect(tabela).toBe("corretores");
      return {
        update: (valores: unknown) => ({
          eq: async (coluna: string, valor: unknown) => {
            updatesDeCorretores.push({ valores, coluna, valor });
            return { data: null, error: null };
          },
        }),
      };
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));

const { definirSenha } = await import("./acoes");

async function enviar(nova: string, confirmacao: string): Promise<{ erro?: string } | { destino: string } | undefined> {
  const form = new FormData();
  form.set("nova", nova);
  form.set("confirmacao", confirmacao);
  try {
    return await definirSenha(undefined, form);
  } catch (e) {
    const destino = (e as { destino?: string }).destino;
    if (destino) return { destino };
    throw e;
  }
}

beforeEach(() => {
  usuario = { id: "usuario-1", email: "ana@exemplo.com.br" };
  erroDoUpdateUser = null;
  senhasGravadas.length = 0;
  updatesDeCorretores.length = 0;
});

describe("definirSenha", () => {
  it("definirSenha recusa senha curta e confirmação diferente; zera deve_trocar_senha", async () => {
    const curta = await enviar("1234567", "1234567");
    expect(curta).toHaveProperty("erro");
    expect((curta as { erro: string }).erro).toMatch(/8 caracteres/);

    const diferente = await enviar("senha-boa-1", "senha-boa-2");
    expect(diferente).toHaveProperty("erro");
    expect((diferente as { erro: string }).erro).toMatch(/confirma/i);

    expect(senhasGravadas).toEqual([]);
    expect(updatesDeCorretores).toEqual([]);

    const certo = await enviar("senha-boa-1", "senha-boa-1");
    expect(certo).toEqual({ destino: "/corretor" });
    expect(senhasGravadas).toEqual([{ password: "senha-boa-1" }]);
    expect(updatesDeCorretores).toEqual([
      { valores: { deve_trocar_senha: false }, coluna: "user_id", valor: "usuario-1" },
    ]);
  });

  it("sem sessão (link não aberto ou já vencido) volta para entrar", async () => {
    usuario = null;
    expect(await enviar("senha-boa-1", "senha-boa-1")).toEqual({ destino: "/corretor/entrar" });
    expect(senhasGravadas).toEqual([]);
  });

  it("o Auth recusou a senha: explica e não zera nada", async () => {
    erroDoUpdateUser = { message: "Password should be at least 6 characters" };
    const r = await enviar("senha-boa-1", "senha-boa-1");
    expect(r).toHaveProperty("erro");
    expect(updatesDeCorretores).toEqual([]);
  });
});

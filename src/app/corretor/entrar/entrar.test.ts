import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O login honra o `next` que o proxy manda (hoje só para `/plataforma`), com
 * a MESMA régua do link do e-mail (`destinoSeguro`): caminho relativo dentro
 * de `/corretor/` ou de `/plataforma`. Qualquer outra coisa vai para
 * `/corretor` — o `next` vem da URL e qualquer um edita.
 */

let erroDoLogin: unknown = null;
let deveTrocarSenha = false;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async () =>
        erroDoLogin ? { data: { user: null }, error: erroDoLogin } : { data: { user: { id: "usuario-1" } }, error: null },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { deve_trocar_senha: deveTrocarSenha }, error: null }) }),
      }),
    }),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));

const { entrar } = await import("@/app/corretor/actions");
const { FormularioLogin } = await import("./FormularioLogin");

async function login(next?: string): Promise<string | { erro?: string } | undefined> {
  const form = new FormData();
  form.set("email", "ana@exemplo.com.br");
  form.set("senha", "senha-boa-123");
  if (next !== undefined) form.set("next", next);
  try {
    return await entrar(undefined, form);
  } catch (e) {
    const destino = (e as { destino?: string }).destino;
    if (destino) return destino;
    throw e;
  }
}

beforeEach(() => {
  erroDoLogin = null;
  deveTrocarSenha = false;
});

describe("entrar e o next", () => {
  it("sem next, vai para /corretor", async () => {
    expect(await login()).toBe("/corretor");
    expect(await login("")).toBe("/corretor");
  });

  it("next da plataforma devolve o administrador à área dele", async () => {
    expect(await login("/plataforma")).toBe("/plataforma");
    expect(await login("/plataforma/grupos")).toBe("/plataforma/grupos");
  });

  it("next de dentro do painel é honrado", async () => {
    expect(await login("/corretor/leads")).toBe("/corretor/leads");
  });

  it("next externo ou fora das duas áreas vira /corretor", async () => {
    for (const next of ["https://x.com", "//x.com", "/\\x.com", "javascript:alert(1)", "/plataformas", "/corretores"]) {
      expect(await login(next), next).toBe("/corretor");
    }
  });

  it("senha provisória continua mandando para a troca, com ou sem next", async () => {
    deveTrocarSenha = true;
    expect(await login("/plataforma")).toBe("/corretor/senha");
  });

  it("login recusado não redireciona", async () => {
    erroDoLogin = { message: "Invalid login credentials" };
    expect(await login("/plataforma")).toEqual({ erro: "E-mail ou senha inválidos." });
  });

  it("o formulário leva o next num campo oculto", () => {
    const html = renderToStaticMarkup(createElement(FormularioLogin, { next: "/plataforma" }));
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="next"[^>]*value="\/plataforma"/);
    const sem = renderToStaticMarkup(createElement(FormularioLogin, { next: undefined }));
    expect(sem).not.toContain('name="next"');
  });
});

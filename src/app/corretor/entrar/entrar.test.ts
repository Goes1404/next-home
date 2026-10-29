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
let appMetadata: Record<string, unknown> = { senha_trocada_em: new Date().toISOString() };
let emailDoUsuario: string | null = null;
const emailsTentados: string[] = [];
const datasRegistradas: string[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithPassword: async ({ email }: { email: string }) => {
        emailsTentados.push(email);
        return erroDoLogin
          ? { data: { user: null }, error: erroDoLogin }
          : { data: { user: { id: "usuario-1", app_metadata: appMetadata } }, error: null };
      },
      refreshSession: async () => ({ data: {}, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { deve_trocar_senha: deveTrocarSenha }, error: null }) }),
      }),
    }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (nome: string, args: { p_usuario: string }) => {
      expect(nome).toBe("email_do_usuario");
      return { data: args.p_usuario === "eduardo.bezerra" ? emailDoUsuario : null, error: null };
    },
  }),
}));
vi.mock("@/lib/auth/validadeDaSenhaNoServidor", () => ({
  DESTINO_SENHA_VENCIDA: "/corretor/senha?motivo=vencida",
  registrarSenhaTrocada: async (_id: string, _meta: unknown) => {
    datasRegistradas.push(_id);
  },
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));

const { entrar } = await import("@/app/corretor/actions");
const { FormularioLogin } = await import("./FormularioLogin");

async function login(next?: string, quem = "ana@exemplo.com.br"): Promise<string | { erro?: string } | undefined> {
  const form = new FormData();
  form.set("email", quem);
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
  appMetadata = { senha_trocada_em: new Date().toISOString() };
  emailDoUsuario = null;
  emailsTentados.length = 0;
  datasRegistradas.length = 0;
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
    expect(await login("/plataforma")).toEqual({ erro: "Usuário ou senha inválidos." });
  });

  it("entra pelo nome de usuário, traduzido no e-mail da conta (0235)", async () => {
    emailDoUsuario = "eduardo@exemplo.com";
    expect(await login(undefined, "Eduardo.Bezerra")).toBe("/corretor");
    expect(emailsTentados).toEqual(["eduardo@exemplo.com"]);
  });

  it("usuário que não existe responde igual a senha errada, sem tentar o Auth", async () => {
    expect(await login(undefined, "ninguem.aqui")).toEqual({ erro: "Usuário ou senha inválidos." });
    expect(emailsTentados).toEqual([]);
  });

  it("senha com mais de 90 dias manda para a troca", async () => {
    appMetadata = { senha_trocada_em: new Date(Date.now() - 91 * 24 * 3600 * 1000).toISOString() };
    expect(await login()).toBe("/corretor/senha?motivo=vencida");
  });

  it("conta sem data começa a contar no login, sem bloquear", async () => {
    appMetadata = {};
    expect(await login()).toBe("/corretor");
    expect(datasRegistradas).toEqual(["usuario-1"]);
  });

  it("o formulário leva o next num campo oculto", () => {
    const html = renderToStaticMarkup(createElement(FormularioLogin, { next: "/plataforma" }));
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="next"[^>]*value="\/plataforma"/);
    const sem = renderToStaticMarkup(createElement(FormularioLogin, { next: undefined }));
    expect(sem).not.toContain('name="next"');
  });
});

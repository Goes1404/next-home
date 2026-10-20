import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_DO_LINK, valorDoCookie } from "@/lib/auth/linkPendente";

/**
 * O botão de `/auth/continuar` é o único lugar que gasta o token do link.
 *
 * - Review Focus 1: link já usado ou vencido (o `verifyOtp` devolve erro)
 *   leva à tela de entrar com `?link=expirado` — nunca erro genérico.
 * - O cookie do link vale uma tentativa: sai antes de verificar.
 */

let erroDoVerify: unknown = null;
let usuarioDoVerify: { email: string } | null = { email: "ana@exemplo.com.br" };
let saidas = 0;
const verificacoes: unknown[] = [];
let valorNoCookie: string | undefined;
const apagados: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: async (params: unknown) => {
        verificacoes.push(params);
        return { data: erroDoVerify ? {} : { user: usuarioDoVerify }, error: erroDoVerify };
      },
      signOut: async () => {
        saidas++;
        return { error: null };
      },
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (nome === COOKIE_DO_LINK && valorNoCookie !== undefined ? { name: nome, value: valorNoCookie } : undefined),
    delete: (opcoes: unknown) => {
      apagados.push(opcoes);
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));

const { confirmarAcesso } = await import("./acoes");

async function apertar(): Promise<string> {
  try {
    await confirmarAcesso();
  } catch (e) {
    const destino = (e as { destino?: string }).destino;
    if (destino) return destino;
    throw e;
  }
  throw new Error("a action terminou sem redirecionar");
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  erroDoVerify = null;
  usuarioDoVerify = { email: "ana@exemplo.com.br" };
  saidas = 0;
  verificacoes.length = 0;
  apagados.length = 0;
  valorNoCookie = valorDoCookie({ tokenHash: "h1", tipo: "invite", next: "/corretor/definir-senha" });
});

describe("confirmarAcesso (botão de /auth/continuar)", () => {
  it("verifica o token, apaga o cookie do link e segue para o next", async () => {
    expect(await apertar()).toBe("/corretor/definir-senha");
    expect(verificacoes).toEqual([{ type: "invite", token_hash: "h1" }]);
    expect(apagados).toEqual([{ name: COOKIE_DO_LINK, path: "/auth" }]);
  });

  it("link inválido ou usado leva a entrar com link=expirado", async () => {
    erroDoVerify = { code: "otp_expired", message: "Email link is invalid or has expired" };
    expect(await apertar()).toBe("/corretor/entrar?link=expirado");
    expect(apagados).toHaveLength(1);
  });

  it("sem o cookie (outro navegador, mais de 15 min) nem tenta: link=expirado", async () => {
    valorNoCookie = undefined;
    expect(await apertar()).toBe("/corretor/entrar?link=expirado");
    expect(verificacoes).toEqual([]);
  });

  it("cookie adulterado com next externo vai para /corretor", async () => {
    valorNoCookie = "token_hash=h1&type=recovery&next=https%3A%2F%2Fx.com";
    expect(await apertar()).toBe("/corretor");
  });
});

/*
 * Revisão da fase 2A: falha passageira do Auth não queima o link, e o
 * e-mail que a tela mostra só vale se o token confirmar.
 */
describe("falhas e a conta que o link abre", () => {
  it("falha passageira (rede, 5xx, limite) mantém o cookie e volta ao botão com aviso", async () => {
    for (const erro of [
      { name: "AuthRetryableFetchError", message: "fetch failed", status: 0 },
      { message: "Internal Server Error", status: 503 },
      { message: "Request rate limit reached", status: 429, code: "over_request_rate_limit" },
    ]) {
      apagados.length = 0;
      erroDoVerify = erro;
      expect(await apertar()).toBe("/auth/continuar?erro=tentar");
      expect(apagados).toEqual([]);
    }
  });

  it("link inválido ou vencido (4xx do Auth) apaga o cookie e manda pedir outro", async () => {
    erroDoVerify = { message: "Token has expired or is invalid", status: 403, code: "otp_expired" };
    expect(await apertar()).toBe("/corretor/entrar?link=expirado");
    expect(apagados).toHaveLength(1);
    apagados.length = 0;
    erroDoVerify = { message: "invalid", status: 400 };
    expect(await apertar()).toBe("/corretor/entrar?link=expirado");
    expect(apagados).toHaveLength(1);
  });

  it("conta aberta diferente da que o link dizia: fecha a sessão", async () => {
    valorNoCookie = valorDoCookie({ tokenHash: "h1", tipo: "invite", next: "/corretor/definir-senha", email: "ana@exemplo.com.br" });
    usuarioDoVerify = { email: "outra@exemplo.com.br" };
    expect(await apertar()).toBe("/corretor/entrar?link=expirado");
    expect(saidas).toBe(1);

    usuarioDoVerify = { email: "Ana@Exemplo.com.br" };
    expect(await apertar()).toBe("/corretor/definir-senha");
    expect(saidas).toBe(1);
  });

  it("o botão trava no primeiro toque", async () => {
    const { readFileSync } = await import("node:fs");
    const botao = readFileSync("src/app/auth/continuar/BotaoContinuar.tsx", "utf8");
    expect(botao).toMatch(/useFormStatus\(\)/);
    expect(botao).toMatch(/disabled=\{pending\}/);
    const pagina = readFileSync("src/app/auth/continuar/page.tsx", "utf8");
    expect(pagina).toMatch(/<BotaoContinuar \/>/);
  });
});

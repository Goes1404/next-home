import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A porta de volta do e-mail: o link do convite e o da recuperação chegam
 * aqui com o `token_hash`. Dois cuidados:
 *
 * - Review Focus 1: link aberto pela segunda vez (ou depois de vencido) cai
 *   na tela de entrar com uma explicação e o caminho para pedir outro —
 *   nunca num erro genérico.
 * - Review Focus 2: o `next` vem da URL, que qualquer um edita. Só caminho
 *   relativo dentro de `/corretor/` passa; o resto vai para `/corretor`.
 */

let erroDoVerify: unknown = null;
const verificacoes: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      verifyOtp: async (params: unknown) => {
        verificacoes.push(params);
        return { data: {}, error: erroDoVerify };
      },
    },
  }),
}));

const { GET } = await import("./route");

const BASE = "https://painel.exemplo.com.br";

function pedir(query: Record<string, string>): NextRequest {
  const url = new URL("/auth/confirmar", BASE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

/** Para onde a resposta manda, como caminho + query (e conferindo o host). */
function destino(resposta: Response): string {
  expect(resposta.status).toBeGreaterThanOrEqual(300);
  expect(resposta.status).toBeLessThan(400);
  const local = new URL(resposta.headers.get("location")!, BASE);
  expect(local.origin).toBe(BASE);
  return local.pathname + local.search;
}

beforeEach(() => {
  erroDoVerify = null;
  verificacoes.length = 0;
});

describe("GET /auth/confirmar", () => {
  it("token válido abre a sessão e segue para o next de dentro do painel", async () => {
    const r = await GET(pedir({ token_hash: "h1", type: "invite", next: "/corretor/definir-senha" }));
    expect(verificacoes).toEqual([{ type: "invite", token_hash: "h1" }]);
    expect(destino(r)).toBe("/corretor/definir-senha");
  });

  it("next externo vira /corretor", async () => {
    for (const next of ["https://x.com", "//x.com", "/plataforma", "javascript:alert(1)", "/corretor/../plataforma", "/\\x.com"]) {
      const r = await GET(pedir({ token_hash: "h1", type: "recovery", next }));
      expect(destino(r), next).toBe("/corretor");
    }

    const dentro = await GET(pedir({ token_hash: "h1", type: "recovery", next: "/corretor/leads" }));
    expect(destino(dentro)).toBe("/corretor/leads");
  });

  it("sem next vai para /corretor", async () => {
    const r = await GET(pedir({ token_hash: "h1", type: "recovery" }));
    expect(destino(r)).toBe("/corretor");
  });

  it("link inválido ou usado leva a entrar com link=expirado", async () => {
    erroDoVerify = { code: "otp_expired", message: "Email link is invalid or has expired" };
    const r = await GET(pedir({ token_hash: "h1", type: "invite", next: "/corretor/definir-senha" }));
    expect(destino(r)).toBe("/corretor/entrar?link=expirado");
  });

  it("sem token ou com tipo desconhecido nem tenta: link=expirado", async () => {
    expect(destino(await GET(pedir({ type: "invite" })))).toBe("/corretor/entrar?link=expirado");
    expect(destino(await GET(pedir({ token_hash: "h1", type: "signup" })))).toBe("/corretor/entrar?link=expirado");
    expect(destino(await GET(pedir({ token_hash: "h1" })))).toBe("/corretor/entrar?link=expirado");
    expect(verificacoes).toEqual([]);
  });
});

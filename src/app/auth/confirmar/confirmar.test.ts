import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { COOKIE_DO_LINK, lerCookieDoLink } from "@/lib/auth/linkPendente";
import { GET } from "./route";

/**
 * A porta de volta do e-mail: o link do convite e o da recuperação chegam
 * aqui com o `token_hash`. Três cuidados:
 *
 * - O GET NÃO gasta o token. Filtros de e-mail (Safe Links do Microsoft 365)
 *   abrem o link antes da pessoa; quem gasta é o botão de `/auth/continuar`.
 * - Review Focus 1: link incompleto cai na tela de entrar com explicação.
 * - Review Focus 2: o `next` vem da URL, que qualquer um edita. Só caminho
 *   relativo dentro de `/corretor/` passa; o resto vira `/corretor`.
 */

const BASE = "https://painel.exemplo.com.br";

function pedir(query: Record<string, string>): NextRequest {
  const url = new URL("/auth/confirmar", BASE);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

/** Para onde a resposta manda, como caminho + query (e conferindo o host). */
function destino(resposta: Response): string {
  expect(resposta.status).toBe(303);
  // Relativo: o cookie do link é do host do clique, e `request.url` pode
  // trazer outro (localhost × 127.0.0.1 no dev; host interno atrás de proxy).
  expect(resposta.headers.get("location")).toMatch(/^\/[^/\\]/);
  const local = new URL(resposta.headers.get("location")!, BASE);
  expect(local.origin).toBe(BASE);
  return local.pathname + local.search;
}

function cookieGuardado(resposta: Response): string | null {
  const linha = resposta.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_DO_LINK}=`));
  return linha ?? null;
}

function linkGuardado(resposta: Response) {
  const linha = cookieGuardado(resposta);
  expect(linha).not.toBeNull();
  const valor = decodeURIComponent(linha!.split(";")[0].slice(COOKIE_DO_LINK.length + 1));
  return lerCookieDoLink(valor);
}

describe("GET /auth/confirmar", () => {
  it("guarda o link num cookie httpOnly de /auth e manda para o botão, sem tela com o token", async () => {
    const r = await GET(pedir({ token_hash: "h1", type: "invite", next: "/corretor/definir-senha" }));
    expect(destino(r)).toBe("/auth/continuar");

    const linha = cookieGuardado(r)!;
    expect(linha).toMatch(/HttpOnly/i);
    expect(linha).toMatch(/Path=\/auth(;|$)/);
    expect(linha).toMatch(/SameSite=lax/i);
    expect(linha).toMatch(/Secure/i);
    expect(linha).toMatch(/Max-Age=900/);
    expect(linkGuardado(r)).toEqual({ tokenHash: "h1", tipo: "invite", next: "/corretor/definir-senha" });
  });

  it("o GET não gasta o token: a rota nem conhece o verifyOtp", () => {
    const codigo = readFileSync(join(process.cwd(), "src/app/auth/confirmar/route.ts"), "utf8").replace(
      /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
      "",
    );
    expect(codigo).not.toMatch(/verifyOtp|exchangeCodeForSession|createClient/);
  });

  it("next externo vira /corretor", async () => {
    for (const next of ["https://x.com", "//x.com", "/plataforma", "javascript:alert(1)", "/corretor/../plataforma", "/\\x.com"]) {
      const r = await GET(pedir({ token_hash: "h1", type: "recovery", next }));
      expect(linkGuardado(r)?.next, next).toBe("/corretor");
    }

    const dentro = await GET(pedir({ token_hash: "h1", type: "recovery", next: "/corretor/leads" }));
    expect(linkGuardado(dentro)?.next).toBe("/corretor/leads");
  });

  it("sem next guarda /corretor", async () => {
    const r = await GET(pedir({ token_hash: "h1", type: "recovery" }));
    expect(linkGuardado(r)?.next).toBe("/corretor");
  });

  it("sem token ou com tipo desconhecido: link=expirado, sem cookie", async () => {
    const casos: Record<string, string>[] = [{ type: "invite" }, { token_hash: "h1", type: "signup" }, { token_hash: "h1" }];
    for (const q of casos) {
      const r = await GET(pedir(q));
      expect(destino(r)).toBe("/corretor/entrar?link=expirado");
      expect(cookieGuardado(r)).toBeNull();
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O proxy decide só QUEM precisa de sessão; quem decide se a pessoa é
 * administrador da plataforma é a guarda de cada página.
 *
 * Junção das frentes (Task 9): o redirecionamento sem sessão de `/plataforma`
 * leva `?next=` para o login devolver o administrador à área dele — sem isso
 * ele entraria, cairia em `/corretor` e, sem ficha de corretor, em "Conta sem
 * vínculo", tendo de digitar o endereço de novo.
 */

let logado = false;
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: logado ? { claims: { sub: "usuario-1" } } : null }) },
  }),
}));

const { proxy } = await import("@/proxy");
const { NextRequest } = await import("next/server");

const BASE = "https://painel.exemplo.com.br";

async function destino(caminho: string): Promise<string | null> {
  const r = await proxy(new NextRequest(new URL(caminho, BASE)));
  const location = r.headers.get("location");
  if (!location) return null;
  const url = new URL(location, BASE);
  return url.pathname + url.search;
}

beforeEach(() => {
  logado = false;
});

describe("proxy e a área da plataforma", () => {
  it("sem sessão, /plataforma vai para o login levando o next", async () => {
    expect(await destino("/plataforma")).toBe("/corretor/entrar?next=%2Fplataforma");
    expect(await destino("/plataforma/grupos?x=1")).toBe("/corretor/entrar?next=%2Fplataforma%2Fgrupos%3Fx%3D1");
  });

  it("o painel do corretor continua indo para o login sem next", async () => {
    expect(await destino("/corretor/leads")).toBe("/corretor/entrar");
  });

  it("com sessão, a plataforma abre (a guarda da página decide o resto)", async () => {
    logado = true;
    expect(await destino("/plataforma")).toBeNull();
  });

  it("/plataformas não é a área da plataforma", async () => {
    expect(await destino("/plataformas")).toBeNull();
  });
});

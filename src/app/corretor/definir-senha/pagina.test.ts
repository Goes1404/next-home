import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A tela de criar senha só abre para a sessão que o link acabou de abrir —
 * a mesma régua da action (`sessaoAbertaPorLink`). Sem isso, quem entrou com
 * senha preencheria o formulário para só então ser mandado embora.
 */

const AGORA_S = 1_792_448_121;
let claims: Record<string, unknown> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));
vi.mock("./FormularioDefinirSenha", () => ({ FormularioDefinirSenha: () => null }));

const { default: DefinirSenhaPage } = await import("./page");

async function abrir(): Promise<string> {
  try {
    await DefinirSenhaPage();
    return "abriu";
  } catch (e) {
    const destino = (e as { destino?: string }).destino;
    if (destino) return destino;
    throw e;
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA_S * 1000);
});

describe("página de criar senha", () => {
  it("abre para a sessão do link recente", async () => {
    claims = { sub: "u1", email: "ana@exemplo.com.br", amr: [{ method: "otp", timestamp: AGORA_S - 30 }] };
    expect(await abrir()).toBe("abriu");
  });

  it("sessão de login com senha vai para a troca que pede a atual", async () => {
    claims = { sub: "u1", amr: [{ method: "password", timestamp: AGORA_S - 30 }] };
    expect(await abrir()).toBe("/corretor/senha?link=vencido");
  });

  it("sem sessão vai para entrar", async () => {
    claims = null;
    expect(await abrir()).toBe("/corretor/entrar");
  });
});

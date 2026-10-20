import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_DO_LINK, valorDoCookie } from "@/lib/auth/linkPendente";

/**
 * A tela do botão diz QUAL conta o link abre e avisa quando o navegador já
 * tem outra aberta (revisão da fase 2A). Sem isso, quem abre o próprio link
 * num computador com a sessão de um colega entrava como outra pessoa sem
 * entender por quê.
 */

let valorNoCookie: string | undefined;
let claims: Record<string, unknown> | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => (nome === COOKIE_DO_LINK && valorNoCookie !== undefined ? { name: nome, value: valorNoCookie } : undefined),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));
vi.mock("./acoes", () => ({ confirmarAcesso: async () => {} }));
vi.mock("./BotaoContinuar", () => ({ BotaoContinuar: () => null }));

const { default: ContinuarPage } = await import("./page");

async function abrir(erro?: string): Promise<string> {
  const elemento = await ContinuarPage({ searchParams: Promise.resolve(erro ? { erro } : {}) });
  return renderToStaticMarkup(elemento);
}

beforeEach(() => {
  claims = null;
  valorNoCookie = valorDoCookie({ tokenHash: "h1", tipo: "invite", next: "/corretor/definir-senha", email: "ana@exemplo.com.br" });
});

describe("tela do botão", () => {
  it("diz qual conta o link abre", async () => {
    const html = await abrir();
    expect(html).toContain("ana@exemplo.com.br");
    expect(html).not.toContain("está aberta");
  });

  it("avisa quando o navegador já tem OUTRA conta aberta", async () => {
    claims = { sub: "u2", email: "bruno@exemplo.com.br" };
    const html = await abrir();
    expect(html).toContain("bruno@exemplo.com.br");
    expect(html).toContain("ela é fechada");
  });

  it("a mesma conta aberta não gera aviso", async () => {
    claims = { sub: "u1", email: "Ana@Exemplo.com.br" };
    expect(await abrir()).not.toContain("está aberta");
  });

  it("depois de uma falha passageira, diz que o link continua valendo", async () => {
    expect(await abrir("tentar")).toContain("continua valendo");
  });
});

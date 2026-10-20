import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../test/bancoFalso";

/**
 * "Sair e receber novo link" (revisão da fase 2A): o convidado que passou
 * dos 15 minutos caía em `/corretor/senha?link=vencido`, que pede a senha
 * atual que ele nunca teve, sem saída. O botão manda o link para o e-mail
 * DA CONTA (o do Auth da sessão), com o mesmo limite do "Esqueci a senha", e
 * só fecha a sessão se o link saiu.
 */

const GRUPO = "00000000-0000-0000-0000-00000000000a";
let banco: BancoFalso;
let usuario: { id: string; email: string | null } | null;
let saidas = 0;
const pedidosDeLink: unknown[][] = [];
let enviado = true;

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: usuario }, error: null }),
      signOut: async () => {
        saidas++;
        return { error: null };
      },
    },
  }),
}));
vi.mock("@/lib/auth/links", () => ({
  gerarLinkDeAcesso: async (...args: unknown[]) => {
    pedidosDeLink.push(args);
    return { ok: true, url: "https://site/auth/confirmar?token_hash=h", userId: "usuario-1" };
  },
}));
vi.mock("@/lib/auth/emailsDeAcesso", () => ({
  enviarLinkDeAcesso: async () => (enviado ? { enviado: true, id: "m" } : { enviado: false, motivo: "sem_chave" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));

const { sairEReceberNovoLink } = await import("./acoes");

async function apertar(): Promise<string> {
  try {
    await sairEReceberNovoLink();
  } catch (e) {
    const destino = (e as { destino?: string }).destino;
    if (destino) return destino;
    throw e;
  }
  throw new Error("a action deveria redirecionar");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  usuario = { id: "usuario-1", email: "Ana@Exemplo.com.br" };
  saidas = 0;
  enviado = true;
  pedidosDeLink.length = 0;
  banco = bancoFalso({
    corretores: [{ id: "c1", user_id: "usuario-1", email: null, grupo_id: GRUPO }],
    grupos: [{ id: GRUPO, nome: "Imobiliária Sol" }],
    admin_eventos: [],
  });
});

describe("sair e receber novo link", () => {
  it("manda o link para o e-mail do Auth da sessão e só então sai", async () => {
    expect(await apertar()).toBe("/corretor/esqueci-a-senha?enviado=conta");
    expect(pedidosDeLink).toEqual([["recovery", "ana@exemplo.com.br", "/corretor/definir-senha"]]);
    expect(saidas).toBe(1);
    expect(banco.tabelas.admin_eventos).toHaveLength(1);
  });

  it("segue o limite: segundo pedido em menos de 1 min não manda nem sai", async () => {
    await apertar();
    vi.setSystemTime(new Date("2026-10-20T12:00:20Z"));
    expect(await apertar()).toBe("/corretor/senha?link=vencido&pedido=espera");
    expect(pedidosDeLink).toHaveLength(1);
    expect(saidas).toBe(1);
  });

  it("e-mail que não saiu: a sessão fica e a tela diz", async () => {
    enviado = false;
    expect(await apertar()).toBe("/corretor/senha?link=vencido&pedido=falhou");
    expect(saidas).toBe(0);
  });

  it("a página de senha vencida mostra o botão e explica o que fazer", () => {
    const pagina = readFileSync("src/app/corretor/(painel)/senha/page.tsx", "utf8");
    expect(pagina).toMatch(/action=\{sairEReceberNovoLink\}/);
    expect(pagina).toContain("Sair e receber novo link");
    expect(pagina).toMatch(/pedido === "espera"/);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../test/bancoFalso";

/**
 * "Esqueci a senha" é PÚBLICO: qualquer um digita qualquer e-mail. A resposta
 * é a mesma exista ou não a conta, seja ou não endereço de acesso antigo, e
 * saia ou não o e-mail — senão a tela vira um jeito de descobrir quem tem
 * login (e em qual grupo). O trabalho de verdade roda depois da resposta
 * (`after`), para nem o tempo de resposta denunciar a conta.
 */

const GRUPO = "00000000-0000-0000-0000-00000000000a";

let banco: BancoFalso;
let respostaDoLink: unknown;
const pedidosDeLink: unknown[][] = [];
const enviados: unknown[][] = [];
const depois: (() => unknown)[] = [];

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/auth/links", () => ({
  gerarLinkDeAcesso: async (...args: unknown[]) => {
    pedidosDeLink.push(args);
    return respostaDoLink;
  },
}));
vi.mock("@/lib/auth/emailsDeAcesso", () => ({
  enviarLinkDeAcesso: async (...args: unknown[]) => {
    enviados.push(args);
    return { enviado: false, motivo: "sem_chave" };
  },
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    depois.push(fn);
  },
}));
// O proxy (teste no fim): ninguém está logado.
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: null }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { destino: url });
  },
}));

const { pedirLinkDeSenha } = await import("./acoes");
const { proxy } = await import("@/proxy");
const { NextRequest } = await import("next/server");

/** Roda a action como o navegador: devolve para onde ela mandou. */
async function pedir(email: string): Promise<string> {
  const form = new FormData();
  form.set("email", email);
  try {
    await pedirLinkDeSenha(form);
  } catch (e) {
    const destino = (e as { destino?: string }).destino;
    if (destino) return destino;
    throw e;
  }
  throw new Error("a action deveria redirecionar");
}

async function rodarDepois() {
  while (depois.length) await depois.shift()!();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  // Sem RESEND_API_KEY o envio não sai e a action avisa no log: esperado aqui.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  pedidosDeLink.length = 0;
  enviados.length = 0;
  depois.length = 0;
  respostaDoLink = { ok: true, url: "https://site/auth/confirmar?token_hash=h&type=recovery", userId: "usuario-1" };
  banco = bancoFalso({
    corretores: [{ id: "c1", user_id: "usuario-1", email: "Ana@Exemplo.com.br", grupo_id: GRUPO }],
    grupos: [{ id: GRUPO, nome: "Imobiliária Sol" }],
    admin_eventos: [],
  });
});

const pedidos = () => banco.tabelas.admin_eventos.filter((e) => e.acao === "link_de_senha_pedido");

describe("pedirLinkDeSenha", () => {
  it("esqueci a senha responde igual exista ou não a conta", async () => {
    const comConta = await pedir("ana@exemplo.com.br");
    await rodarDepois();
    expect(pedidosDeLink).toEqual([["recovery", "ana@exemplo.com.br", "/corretor/definir-senha"]]);
    expect(enviados).toEqual([["recovery", "ana@exemplo.com.br", "Imobiliária Sol", "https://site/auth/confirmar?token_hash=h&type=recovery"]]);

    enviados.length = 0;
    respostaDoLink = { ok: false, motivo: "falha" };
    const semConta = await pedir("ninguem@exemplo.com.br");
    await rodarDepois();
    expect(enviados).toEqual([]);

    const deAcesso = await pedir("fulano@nexthome.com");
    await rodarDepois();
    expect(pedidosDeLink.map((p) => p[1])).not.toContain("fulano@nexthome.com");

    expect(semConta).toBe(comConta);
    expect(deAcesso).toBe(comConta);
    expect(comConta).toBe("/corretor/esqueci-a-senha?enviado=1");
  });

  it("nada de e-mail ou e-mail sem @ também cai na mesma frase, sem gerar link", async () => {
    expect(await pedir("")).toBe("/corretor/esqueci-a-senha?enviado=1");
    expect(await pedir("sem-arroba")).toBe("/corretor/esqueci-a-senha?enviado=1");
    await rodarDepois();
    expect(pedidosDeLink).toEqual([]);
  });

  it("o trabalho roda depois da resposta, não antes", async () => {
    await pedir("ana@exemplo.com.br");
    expect(pedidosDeLink).toEqual([]);
    await rodarDepois();
    expect(pedidosDeLink).toHaveLength(1);
  });

  it("e-mail sem ficha não gera link nem registro", async () => {
    banco = bancoFalso({ corretores: [], grupos: [], admin_eventos: [] });
    expect(await pedir("ana@exemplo.com.br")).toBe("/corretor/esqueci-a-senha?enviado=1");
    await rodarDepois();
    expect(pedidosDeLink).toEqual([]);
    expect(enviados).toEqual([]);
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("o link sai só se o Auth devolver o login da ficha", async () => {
    respostaDoLink = { ok: true, url: "https://site/x", userId: "usuario-de-outro" };
    await pedir("ana@exemplo.com.br");
    await rodarDepois();
    expect(enviados).toEqual([]);
  });
});

/*
 * O link sai por generateLink com a chave de serviço, que passa por cima do
 * limite do próprio Supabase: sem um limite nosso, qualquer um mandaria
 * centenas de e-mails para a caixa de alguém (revisão da fase 2A).
 */
describe("limite de pedidos por e-mail", () => {
  it("no máximo 1 pedido a cada 60 s; a resposta é a mesma", async () => {
    const primeiro = await pedir("ana@exemplo.com.br");
    await rodarDepois();
    vi.setSystemTime(new Date("2026-10-20T12:00:30Z"));
    const segundo = await pedir("ANA@exemplo.com.br");
    await rodarDepois();
    expect(segundo).toBe(primeiro);
    expect(pedidosDeLink).toHaveLength(1);
    // O pedido recusado não grava linha: quem insiste não enche a tabela.
    expect(pedidos()).toHaveLength(1);

    vi.setSystemTime(new Date("2026-10-20T12:01:01Z"));
    await pedir("ana@exemplo.com.br");
    await rodarDepois();
    expect(pedidosDeLink).toHaveLength(2);
  });

  it("no máximo 5 por hora", async () => {
    for (let i = 0; i < 7; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 12, i * 2)));
      await pedir("ana@exemplo.com.br");
      await rodarDepois();
    }
    expect(pedidosDeLink).toHaveLength(5);

    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 13, 1)));
    await pedir("ana@exemplo.com.br");
    await rodarDepois();
    expect(pedidosDeLink).toHaveLength(6);
  });

  it("o registro fica no grupo da ficha e não leva o e-mail", async () => {
    await pedir("ana@exemplo.com.br");
    await rodarDepois();
    expect(pedidos()).toHaveLength(1);
    expect(pedidos()[0]).toMatchObject({ grupo_id: GRUPO, alvo_corretor_id: "c1", ator_id: null });
    expect(JSON.stringify(pedidos()[0])).not.toContain("exemplo.com.br");
  });

  it("sem conseguir ler os pedidos anteriores, não manda (fechado)", async () => {
    const original = banco.cliente.from;
    banco.cliente.from = (tabela: string) => {
      const q = original(tabela);
      if (tabela !== "admin_eventos") return q;
      return { ...q, select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ gte: async () => ({ data: null, error: { message: "timeout" } }) }) }) }) }) } as never;
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    await pedir("ana@exemplo.com.br");
    await rodarDepois();
    expect(pedidosDeLink).toEqual([]);
  });
});

describe("proxy", () => {
  it("abre a tela de esqueci a senha sem sessão; o resto do painel continua pedindo login", async () => {
    const aberta = await proxy(new NextRequest("https://painel.exemplo.com.br/corretor/esqueci-a-senha"));
    expect(aberta.headers.get("location")).toBeNull();

    const fechada = await proxy(new NextRequest("https://painel.exemplo.com.br/corretor/definir-senha"));
    expect(new URL(fechada.headers.get("location")!).pathname).toBe("/corretor/entrar");

    const volta = await proxy(new NextRequest("https://painel.exemplo.com.br/auth/confirmar?token_hash=h"));
    expect(volta.headers.get("location")).toBeNull();
  });
});

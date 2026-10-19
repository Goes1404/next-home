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
  // Sem RESEND_API_KEY o envio não sai e a action avisa no log: esperado aqui.
  vi.spyOn(console, "warn").mockImplementation(() => {});
  pedidosDeLink.length = 0;
  enviados.length = 0;
  depois.length = 0;
  respostaDoLink = { ok: true, url: "https://site/auth/confirmar?token_hash=h&type=recovery", userId: "usuario-1" };
  banco = bancoFalso({
    corretores: [{ id: "c1", user_id: "usuario-1", grupo_id: GRUPO }],
    grupos: [{ id: GRUPO, nome: "Imobiliária Sol" }],
  });
});

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

  it("conta sem ficha de corretor recebe o e-mail com o nome da plataforma", async () => {
    banco = bancoFalso({ corretores: [], grupos: [] });
    await pedir("ana@exemplo.com.br");
    await rodarDepois();
    expect(enviados).toHaveLength(1);
    expect(enviados[0][2]).toBe("Next Home");
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

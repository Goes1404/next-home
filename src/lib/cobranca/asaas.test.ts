import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  asaasConfigurado,
  buscarOuCriarCliente,
  cancelarAssinatura,
  celularNacional,
  criarAssinatura,
  ErroDoAsaas,
  faturaEmAberto,
  lerFaturaEmAberto,
  URL_DO_ASAAS,
  variaveisDoAsaasFaltando,
  type PagamentoDoAsaas,
} from "./asaas";

/**
 * O cliente do Asaas (29/10/2026, 0241) com o `fetch` falso: a URL do
 * ambiente, o cabeçalho `access_token`, o corpo da assinatura (Pix, boleto e
 * cartão: `UNDEFINED`, mensal) e o erro sem a chave dentro.
 */

type Chamada = { url: string; init: RequestInit };
let chamadas: Chamada[];
let respostas: { status: number; corpo: unknown }[];

const CHAVE = "$aact_chave_falsa_de_teste";

beforeEach(() => {
  chamadas = [];
  respostas = [];
  vi.stubEnv("ASAAS_AMBIENTE", "sandbox");
  vi.stubEnv("ASAAS_API_KEY", CHAVE);
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "token-do-webhook-de-teste-com-32-caracteres");
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas.shift() ?? { status: 200, corpo: {} };
    return new Response(JSON.stringify(r.corpo), { status: r.status });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const cabecalhos = (c: Chamada) => c.init.headers as Record<string, string>;

describe("configuração", () => {
  it("diz quais variáveis faltam (ambiente fora da lista conta como faltando)", () => {
    expect(variaveisDoAsaasFaltando({})).toEqual(["ASAAS_AMBIENTE", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"]);
    expect(variaveisDoAsaasFaltando({ ASAAS_AMBIENTE: "production", ASAAS_API_KEY: "x", ASAAS_WEBHOOK_TOKEN: "y" })).toEqual([
      "ASAAS_AMBIENTE",
    ]);
    expect(asaasConfigurado({ ASAAS_AMBIENTE: "producao", ASAAS_API_KEY: "x", ASAAS_WEBHOOK_TOKEN: "y" })).toBe(true);
  });

  it("sem configuração, nem chama o Asaas", async () => {
    vi.stubEnv("ASAAS_AMBIENTE", "");
    await expect(cancelarAssinatura("sub_1")).rejects.toBeInstanceOf(ErroDoAsaas);
    expect(chamadas).toHaveLength(0);
  });

  it("usa a URL do ambiente e o cabeçalho access_token", async () => {
    await cancelarAssinatura("sub_1");
    expect(chamadas[0].url).toBe(`${URL_DO_ASAAS.sandbox}/subscriptions/sub_1`);
    expect(chamadas[0].init.method).toBe("DELETE");
    expect(cabecalhos(chamadas[0]).access_token).toBe(CHAVE);
    vi.stubEnv("ASAAS_AMBIENTE", "producao");
    await cancelarAssinatura("sub_2");
    expect(chamadas[1].url).toBe("https://api.asaas.com/v3/subscriptions/sub_2");
    expect(URL_DO_ASAAS.sandbox).toBe("https://api-sandbox.asaas.com/v3");
  });
});

describe("clientes", () => {
  it("reaproveita o cliente com a mesma referência (o id do grupo)", async () => {
    respostas.push({ status: 200, corpo: { data: [{ id: "cus_1", name: "Imob" }] } });
    const c = await buscarOuCriarCliente({ nome: "Imob", cpfCnpj: "11222333000181", referencia: "grupo-1" });
    expect(c.id).toBe("cus_1");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe(`${URL_DO_ASAAS.sandbox}/customers?externalReference=grupo-1&limit=1`);
  });

  it("cria o cliente com nome, documento, e-mail e celular nacional", async () => {
    respostas.push({ status: 200, corpo: { data: [] } }, { status: 200, corpo: { id: "cus_2", name: "Ana" } });
    const c = await buscarOuCriarCliente({
      nome: "Ana",
      cpfCnpj: "52998224725",
      email: "ana@x.com",
      celular: celularNacional("5511987654321"),
      referencia: "grupo-2",
    });
    expect(c.id).toBe("cus_2");
    expect(chamadas[1].init.method).toBe("POST");
    expect(JSON.parse(String(chamadas[1].init.body))).toEqual({
      name: "Ana",
      cpfCnpj: "52998224725",
      email: "ana@x.com",
      mobilePhone: "11987654321",
      externalReference: "grupo-2",
    });
  });

  it("celularNacional tira o 55 e recusa número torto", () => {
    expect(celularNacional("5511987654321")).toBe("11987654321");
    expect(celularNacional("(11) 3456-7890")).toBe("1134567890");
    expect(celularNacional("123")).toBeNull();
    expect(celularNacional(null)).toBeNull();
  });
});

describe("assinaturas", () => {
  it("cria a assinatura mensal com a forma de pagamento à escolha do cliente", async () => {
    respostas.push({ status: 200, corpo: { id: "sub_9", status: "ACTIVE" } });
    const a = await criarAssinatura({
      clienteId: "cus_1",
      valor: 127,
      proximoVencimento: "2026-11-05",
      descricao: "Astro Soluções — Imobiliária",
      referencia: "grupo-1",
    });
    expect(a.id).toBe("sub_9");
    expect(chamadas[0].url).toBe(`${URL_DO_ASAAS.sandbox}/subscriptions`);
    expect(JSON.parse(String(chamadas[0].init.body))).toEqual({
      customer: "cus_1",
      billingType: "UNDEFINED",
      cycle: "MONTHLY",
      value: 127,
      nextDueDate: "2026-11-05",
      description: "Astro Soluções — Imobiliária",
      externalReference: "grupo-1",
    });
  });

  it("recusa valor e data tortos sem chamar o Asaas", async () => {
    await expect(criarAssinatura({ clienteId: "c", valor: 0, proximoVencimento: "2026-11-05", descricao: "d", referencia: "g" })).rejects.toThrow();
    await expect(criarAssinatura({ clienteId: "c", valor: 10, proximoVencimento: "05/11/2026", descricao: "d", referencia: "g" })).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });

  it("o erro do Asaas leva o status e a descrição, nunca a chave", async () => {
    respostas.push({ status: 400, corpo: { errors: [{ code: "invalid_cpfCnpj", description: "O CPF/CNPJ informado é inválido." }] } });
    const erro = await criarAssinatura({ clienteId: "c", valor: 10, proximoVencimento: "2026-11-05", descricao: "d", referencia: "g" }).catch(
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ErroDoAsaas);
    expect((erro as ErroDoAsaas).status).toBe(400);
    expect((erro as Error).message).toContain("O CPF/CNPJ informado é inválido.");
    expect((erro as Error).message).not.toContain(CHAVE);
  });
});

describe("fatura em aberto", () => {
  const pagamento = (p: Partial<PagamentoDoAsaas>): PagamentoDoAsaas => ({
    id: "pay",
    customer: "cus",
    value: 97,
    status: "PENDING",
    dueDate: "2026-11-05",
    invoiceUrl: "https://sandbox.asaas.com/i/abc",
    ...p,
  });

  it("escolhe a vencida mais antiga entre as pendentes, e ignora as pagas", () => {
    const f = faturaEmAberto([
      pagamento({ id: "p1", status: "RECEIVED", dueDate: "2026-09-05", invoiceUrl: "https://x/pago" }),
      pagamento({ id: "p2", status: "PENDING", dueDate: "2026-11-05", invoiceUrl: "https://x/nov" }),
      pagamento({ id: "p3", status: "OVERDUE", dueDate: "2026-10-05", invoiceUrl: "https://x/out" }),
    ]);
    expect(f).toEqual({ url: "https://x/out", vencimento: "2026-10-05", valor: 97 });
    expect(faturaEmAberto([pagamento({ status: "CONFIRMED" })])).toBeNull();
    expect(faturaEmAberto([pagamento({ invoiceUrl: "javascript:alert(1)" })])).toBeNull();
  });

  it("lê as cobranças da assinatura; erro do Asaas vira null", async () => {
    respostas.push({ status: 200, corpo: { data: [pagamento({})] } });
    expect(await lerFaturaEmAberto("sub_1")).toEqual({ url: "https://sandbox.asaas.com/i/abc", vencimento: "2026-11-05", valor: 97 });
    expect(chamadas[0].url).toBe(`${URL_DO_ASAAS.sandbox}/subscriptions/sub_1/payments?limit=20`);
    respostas.push({ status: 500, corpo: {} });
    expect(await lerFaturaEmAberto("sub_1")).toBeNull();
  });
});

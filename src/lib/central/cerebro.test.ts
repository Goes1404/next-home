import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAXIMO_DE_VOLTAS, pensar, type EntradaDoCerebro } from "./cerebro";

type Resposta = { status?: number; corpo: unknown };

function openaiFalsa(respostas: Resposta[]) {
  const pedidos: { messages: { role: string }[]; tools?: unknown[] }[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body)));
    const r = respostas.shift() ?? { corpo: { choices: [{ message: { content: "fim" } }] } };
    const corpo = typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo);
    return new Response(corpo, { status: r.status ?? 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, pedidos };
}

const texto = (t: string, usage = { prompt_tokens: 100, completion_tokens: 20 }) => ({
  corpo: { choices: [{ message: { content: t } }], usage },
});
const ferramenta = (nome: string, args: object) => ({
  corpo: {
    choices: [{ message: { content: null, tool_calls: [{ id: `c-${nome}`, type: "function", function: { name: nome, arguments: JSON.stringify(args) } }] } }],
    usage: { prompt_tokens: 100, completion_tokens: 10 },
  },
});

function entrada(parcial: Partial<EntradaDoCerebro>): EntradaDoCerebro {
  return {
    sistema: "Você é o assistente.",
    historico: [],
    mensagem: "oi",
    ferramentas: [{ nome: "ajuda", descricao: "lista", parametros: { type: "object", properties: {} } }],
    executar: async () => ({ ok: true }),
    quemPaga: { corretorId: "c1", grupoId: "g1" },
    registrar: vi.fn(async () => undefined),
    ...parcial,
  };
}

beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "chave-de-teste"));
afterEach(() => vi.unstubAllEnvs());

describe("pensar", () => {
  it("resposta direta, sem ferramenta, com histórico na ordem", async () => {
    const { fetchImpl, pedidos } = openaiFalsa([texto("Olá, Carol!")]);
    const r = await pensar(entrada({ fetchImpl, historico: [{ papel: "pessoa", texto: "a", em: "" }, { papel: "central", texto: "b", em: "" }] }));
    expect(r).toMatchObject({ ok: true, texto: "Olá, Carol!", chamadas: [] });
    expect(pedidos[0].messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(pedidos[0].tools).toHaveLength(1);
  });

  it("chama a ferramenta, devolve o resultado ao modelo e responde", async () => {
    const executar = vi.fn(async () => ({ itens: ["cadastrar lead"] }));
    const { fetchImpl, pedidos } = openaiFalsa([ferramenta("ajuda", {}), texto("Eu sei: cadastrar lead.")]);
    const r = await pensar(entrada({ fetchImpl, executar }));
    expect(executar).toHaveBeenCalledWith("ajuda", {});
    expect(r.ok && r.texto).toBe("Eu sei: cadastrar lead.");
    expect(r.chamadas).toEqual([{ nome: "ajuda", argumentos: {}, resultado: { itens: ["cadastrar lead"] } }]);
    expect(pedidos[1].messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
  });

  it("para depois do teto de voltas sem inventar resposta", async () => {
    const { fetchImpl } = openaiFalsa(Array.from({ length: MAXIMO_DE_VOLTAS + 2 }, () => ferramenta("ajuda", {})));
    const r = await pensar(entrada({ fetchImpl }));
    expect(r.ok && r.texto).toMatch(/Não consegui terminar/);
    expect(r.chamadas).toHaveLength(MAXIMO_DE_VOLTAS);
  });

  it("sem crédito (429 insufficient_quota): indisponível, nunca lança", async () => {
    const { fetchImpl } = openaiFalsa([{ status: 429, corpo: '{"error":{"code":"insufficient_quota"}}' }]);
    expect(await pensar(entrada({ fetchImpl }))).toMatchObject({ ok: false, indisponivel: true, motivo: "sem_credito" });
  });

  it("timeout: indisponível", async () => {
    const fetchImpl = vi.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_ok, falha) => {
          init?.signal?.addEventListener("abort", () => falha(Object.assign(new Error("abortado"), { name: "AbortError" })));
        }),
    ) as unknown as typeof fetch;
    expect(await pensar(entrada({ fetchImpl, orcamentoMs: 20 }))).toMatchObject({ ok: false, motivo: "timeout" });
  });

  it("sem chave da OpenAI: indisponível sem chamar a rede", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { fetchImpl } = openaiFalsa([]);
    expect(await pensar(entrada({ fetchImpl }))).toMatchObject({ ok: false, motivo: "sem_api_key" });
  });

  it("registra o consumo uma vez por volta, com a finalidade comando", async () => {
    const registrar = vi.fn(async () => undefined);
    const { fetchImpl } = openaiFalsa([ferramenta("ajuda", {}), texto("pronto")]);
    const r = await pensar(entrada({ fetchImpl, registrar }));
    expect(registrar).toHaveBeenCalledTimes(2);
    expect(registrar).toHaveBeenCalledWith({ finalidade: "comando", quemPaga: { corretorId: "c1", grupoId: "g1" } }, expect.objectContaining({ tokensEntrada: 100 }));
    expect(r.ok && r.custoUsd).toBeGreaterThan(0);
  });

  it("argumento que não é JSON vira erro para o modelo, não exceção", async () => {
    const { fetchImpl } = openaiFalsa([
      { corpo: { choices: [{ message: { content: null, tool_calls: [{ id: "x", type: "function", function: { name: "ajuda", arguments: "{quebrado" } }] } }] } },
      texto("ok"),
    ]);
    const r = await pensar(entrada({ fetchImpl }));
    expect(r.chamadas[0].resultado).toEqual({ erro: "Não consegui ler o pedido dessa ação." });
  });
});

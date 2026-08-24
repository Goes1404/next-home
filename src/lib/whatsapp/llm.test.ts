import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A cascata é o que faz "nunca mais ficar sem IA" ser verdade. Estes testes
 * cobrem as decisões que sustentam isso — ordem, pulo de provedor sem chave
 * e orçamento — com os adaptadores dublados, sem tocar em rede.
 */

const chamarGroqJson = vi.fn();
const chamarNvidiaJson = vi.fn();
const chamarGeminiJson = vi.fn();

vi.mock("./nvidia", () => ({
  chamarNvidiaJson: (...args: unknown[]) => chamarNvidiaJson(...args),
  modeloNvidia: () => "meta/llama-3.3-70b-instruct",
  nvidiaConfigurada: () => Boolean(process.env.NVIDIA_API_KEY),
}));

vi.mock("./groq", () => ({
  chamarGroqJson: (...args: unknown[]) => chamarGroqJson(...args),
  modeloGroq: () => "openai/gpt-oss-120b",
  groqConfigurada: () => Boolean(process.env.GROQ_API_KEY),
  /*
   * Os testes deste arquivo são sobre a ORDEM e o ORÇAMENTO da cascata, não
   * sobre o tamanho do prompt — por isso aqui o prompt sempre cabe. Quem
   * cobre o corte por tokens é `groqTpm.test.ts`, com os tamanhos reais
   * medidos em produção.
   */
  promptCabeNaGroq: () => true,
  limiteTpmGroq: () => 8_000,
}));

vi.mock("./gemini", () => ({
  chamarGeminiJson: (...args: unknown[]) => chamarGeminiJson(...args),
  geminiConfigurado: () => Boolean(process.env.GEMINI_API_KEY),
  modeloGemini: () => "gemini-2.5-flash",
}));

const ok = (modelo: string) => ({
  ok: true as const,
  json: { textoResposta: "oi" },
  latenciaMs: 100,
  tokensEntrada: 10,
  tokensSaida: 5,
  modelo,
});

const falha = (erro: string) => ({ ok: false as const, erro, latenciaMs: 100 });

let chamarLlmJson: typeof import("./llm").chamarLlmJson;

beforeEach(async () => {
  vi.resetModules();
  chamarGroqJson.mockReset();
  chamarNvidiaJson.mockReset();
  chamarGeminiJson.mockReset();
  delete process.env.IA_PROVEDOR_FORCADO;
  process.env.NVIDIA_API_KEY = "nvapi-teste";
  process.env.GEMINI_API_KEY = "gemini-teste";
  ({ chamarLlmJson } = await import("./llm"));
});

afterEach(() => {
  delete process.env.NVIDIA_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.IA_PROVEDOR_FORCADO;
});

describe("Ordem da cascata", () => {
  it("o primeiro da fila responde e os seguintes nem são chamados", async () => {
    chamarGeminiJson.mockResolvedValue(ok("gemini-2.5-flash"));

    const r = await chamarLlmJson("prompt");

    expect(r.ok && r.modelo).toBe("gemini-2.5-flash");
    expect(chamarNvidiaJson).not.toHaveBeenCalled();
  });

  it("cota estourada cai no provedor seguinte — o cliente não vê contingência", async () => {
    // É exatamente o caso que motivou tudo isto: http_429 no provedor da vez.
    chamarGeminiJson.mockResolvedValue(falha("http_429"));
    chamarNvidiaJson.mockResolvedValue(ok("mistralai/mistral-nemotron"));

    const r = await chamarLlmJson("prompt");

    expect(r.ok).toBe(true);
    expect(r.ok && r.modelo).toBe("mistralai/mistral-nemotron");
  });

  it("chave inválida no primeiro também passa a vez — nada fica sem resposta", async () => {
    chamarGeminiJson.mockResolvedValue(falha("http_4xx"));
    chamarNvidiaJson.mockResolvedValue(ok("mistralai/mistral-nemotron"));

    expect((await chamarLlmJson("prompt")).ok).toBe(true);
  });

  it("só quando TODOS falham é que existe contingência", async () => {
    chamarGeminiJson.mockResolvedValue(falha("http_429"));
    chamarNvidiaJson.mockResolvedValue(falha("timeout"));

    const r = await chamarLlmJson("prompt");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toBe("timeout");
  });
});

describe("Provedor sem chave", () => {
  it("sem chave de um provedor o sistema segue nos outros, como antes", async () => {
    // É o que torna seguro subir código de provedor novo antes de existir a chave.
    delete process.env.NVIDIA_API_KEY;
    vi.resetModules();
    ({ chamarLlmJson } = await import("./llm"));
    chamarGeminiJson.mockResolvedValue(ok("gemini-2.5-flash"));

    const r = await chamarLlmJson("prompt");

    expect(r.ok && r.modelo).toBe("gemini-2.5-flash");
    expect(chamarNvidiaJson).not.toHaveBeenCalled();
  });

  it("sem chave nenhuma, o motivo é explícito", async () => {
    delete process.env.NVIDIA_API_KEY;
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
    ({ chamarLlmJson } = await import("./llm"));

    const r = await chamarLlmJson("prompt");
    expect(!r.ok && r.erro).toBe("sem_api_key");
  });
});

describe("Orçamento de tempo", () => {
  it("nenhum provedor sozinho consome o orçamento inteiro", async () => {
    // Sem esta fatia, o primeiro gastaria tudo e o segundo nunca teria vez —
    // a cascata viraria enfeite.
    chamarGeminiJson.mockResolvedValue(falha("timeout"));
    chamarNvidiaJson.mockResolvedValue(ok("mistralai/mistral-nemotron"));

    await chamarLlmJson("prompt", { orcamentoMs: 20_000 });

    const tetoPrimeiro = chamarGeminiJson.mock.calls[0][1].timeoutMs;
    expect(tetoPrimeiro).toBeLessThan(20_000);
    expect(chamarNvidiaJson).toHaveBeenCalled();
  });

  it("o pior caso do agente cabe no teto de 60s da função do webhook", async () => {
    const { ORCAMENTO_AGENTE_MS, ORCAMENTO_DOSSIE_MS } = await import("./llm");
    // 6s de espera de rajada + agente + ~5s de envios + dossiê.
    expect(6_000 + ORCAMENTO_AGENTE_MS + 5_000 + ORCAMENTO_DOSSIE_MS).toBeLessThan(60_000);
  });
});

describe("Provedor forçado (usado pelo eval)", () => {
  it("com IA_PROVEDOR_FORCADO=nvidia, o Gemini não cobre a falha", async () => {
    // Sem isto, medir a NVIDIA seria impossível: ela falharia num caso
    // difícil, o Gemini responderia por baixo, e o score seria da mistura.
    process.env.IA_PROVEDOR_FORCADO = "nvidia";
    chamarNvidiaJson.mockResolvedValue(falha("http_429"));

    const r = await chamarLlmJson("prompt");

    expect(r.ok).toBe(false);
    expect(chamarGeminiJson).not.toHaveBeenCalled();
  });
});

describe("Três provedores na cascata", () => {
  it("a Groq vem primeiro — é a mais rápida e o 429 dela custa 60ms", async () => {
    // Com 8.000 tokens/min de teto e ~3.400 por chamada, a Groq estoura
    // cota o tempo todo. Tentar mesmo assim vale: quando passa, responde em
    // 0,7s no lugar de 5-7s; quando recusa, o provedor seguinte assume no
    // mesmo instante e o cliente não percebe.
    const { provedoresDisponiveis } = await import("./llm");
    process.env.GROQ_API_KEY = "gsk-teste";
    vi.resetModules();
    const m = await import("./llm");
    expect(m.provedoresDisponiveis()).toEqual(["groq", "gemini", "nvidia"]);
    expect(provedoresDisponiveis).toBeDefined();
    delete process.env.GROQ_API_KEY;
  });

  it("o terceiro provedor ainda recebe tempo útil quando os dois primeiros falham", async () => {
    // Com a fatia de 55% (o valor de quando eram dois), o terceiro ficaria
    // sem orçamento e a cascata teria um elo decorativo. Este teste mede o
    // efeito, não a constante: o Gemini precisa ser chamado E com prazo.
    process.env.GROQ_API_KEY = "gsk-teste";
    vi.resetModules();
    const { chamarLlmJson: chamar } = await import("./llm");

    chamarGroqJson.mockResolvedValue(falha("http_429"));
    chamarGeminiJson.mockResolvedValue(falha("timeout"));
    chamarNvidiaJson.mockResolvedValue(ok("mistralai/mistral-nemotron"));

    const r = await chamar("prompt", { orcamentoMs: 26_000 });

    expect(r.ok && r.modelo).toBe("mistralai/mistral-nemotron");
    const tetoNvidia = chamarNvidiaJson.mock.calls[0][1].timeoutMs;
    expect(tetoNvidia).toBeGreaterThan(3_000);
    delete process.env.GROQ_API_KEY;
  });
});

describe("Ordem da cascata configurável", () => {
  const semVar = () => delete process.env.IA_ORDEM_PROVEDORES;

  afterEach(semVar);

  it("sem a variável, mantém a ordem medida", async () => {
    semVar();
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    expect(ordemDosProvedores().map((p) => p.nome)).toEqual([
      "groq",
      "gemini",
      "nvidia",
      "openai",
    ]);
  });

  /*
   * O caso do piloto: a Groq saiu por tamanho de prompt e o cliente passou
   * a esperar a latência do Gemini (8,5s de média em produção) quando a
   * OpenAI responde em ~2,6s.
   */
  it("põe o provedor pedido na frente", async () => {
    process.env.IA_ORDEM_PROVEDORES = "openai,gemini";
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    expect(ordemDosProvedores().map((p) => p.nome)).toEqual([
      "openai",
      "gemini",
      "groq",
      "nvidia",
    ]);
  });

  /*
   * Um typo na variável NÃO pode remover provedor da cascata — seria o
   * jeito mais fácil de derrubar o atendimento sem perceber.
   */
  it("nome desconhecido é ignorado e ninguém fica de fora", async () => {
    process.env.IA_ORDEM_PROVEDORES = "openai, xpto ,,gemini";
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    const nomes = ordemDosProvedores().map((p) => p.nome);
    expect(nomes).toEqual(["openai", "gemini", "groq", "nvidia"]);
    expect(nomes).toHaveLength(4);
  });

  it("repetido não duplica", async () => {
    process.env.IA_ORDEM_PROVEDORES = "openai,openai";
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    expect(ordemDosProvedores()).toHaveLength(4);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A cascata é o que faz "nunca mais ficar sem IA" ser verdade. Estes testes
 * cobrem as decisões que sustentam isso — ordem, pulo de provedor sem chave
 * e orçamento — com os adaptadores dublados, sem tocar em rede.
 */

const chamarNvidiaJson = vi.fn();
const chamarGeminiJson = vi.fn();

vi.mock("./nvidia", () => ({
  chamarNvidiaJson: (...args: unknown[]) => chamarNvidiaJson(...args),
  modeloNvidia: () => "meta/llama-3.3-70b-instruct",
  nvidiaConfigurada: () => Boolean(process.env.NVIDIA_API_KEY),
}));

vi.mock("./gemini", () => ({
  chamarGeminiJson: (...args: unknown[]) => chamarGeminiJson(...args),
  geminiConfigurado: () => Boolean(process.env.GEMINI_API_KEY),
  MODELO_GEMINI: "gemini-2.5-flash",
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
  it("com os dois configurados, a NVIDIA responde e o Gemini nem é chamado", async () => {
    chamarNvidiaJson.mockResolvedValue(ok("meta/llama-3.3-70b-instruct"));

    const r = await chamarLlmJson("prompt");

    expect(r.ok && r.modelo).toBe("meta/llama-3.3-70b-instruct");
    expect(chamarGeminiJson).not.toHaveBeenCalled();
  });

  it("cota estourada na NVIDIA cai no Gemini — o cliente não vê contingência", async () => {
    // É exatamente o caso que motivou tudo isto: http_429 no provedor da vez.
    chamarNvidiaJson.mockResolvedValue(falha("http_429"));
    chamarGeminiJson.mockResolvedValue(ok("gemini-2.5-flash"));

    const r = await chamarLlmJson("prompt");

    expect(r.ok).toBe(true);
    expect(r.ok && r.modelo).toBe("gemini-2.5-flash");
  });

  it("chave inválida no primeiro também passa a vez — nada fica sem resposta", async () => {
    chamarNvidiaJson.mockResolvedValue(falha("http_4xx"));
    chamarGeminiJson.mockResolvedValue(ok("gemini-2.5-flash"));

    expect((await chamarLlmJson("prompt")).ok).toBe(true);
  });

  it("só quando TODOS falham é que existe contingência", async () => {
    chamarNvidiaJson.mockResolvedValue(falha("http_429"));
    chamarGeminiJson.mockResolvedValue(falha("timeout"));

    const r = await chamarLlmJson("prompt");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toBe("timeout");
  });
});

describe("Provedor sem chave", () => {
  it("sem NVIDIA_API_KEY o sistema segue no Gemini, como antes", async () => {
    // É o que torna seguro subir este código antes de existir chave da NVIDIA.
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
    chamarNvidiaJson.mockResolvedValue(falha("timeout"));
    chamarGeminiJson.mockResolvedValue(ok("gemini-2.5-flash"));

    await chamarLlmJson("prompt", { orcamentoMs: 20_000 });

    const tetoNvidia = chamarNvidiaJson.mock.calls[0][1].timeoutMs;
    expect(tetoNvidia).toBeLessThan(20_000);
    expect(chamarGeminiJson).toHaveBeenCalled();
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

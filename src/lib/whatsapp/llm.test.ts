import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O motor de IA é UM só (a OpenAI) desde 24/08/2026 — trocar de provedor no
 * meio da conversa mudava o jeito de escrever e o cliente sentia. Estes
 * testes cobrem as decisões que sustentam isso: quem atende, quando os
 * provedores de reserva podem entrar, e o orçamento de tempo. Adaptadores
 * dublados, sem tocar em rede.
 */

const chamarGroqJson = vi.fn();
const chamarNvidiaJson = vi.fn();
const chamarGeminiJson = vi.fn();
const chamarOpenaiJson = vi.fn();

vi.mock("./openai", () => ({
  chamarOpenaiJson: (...args: unknown[]) => chamarOpenaiJson(...args),
  modeloOpenai: () => "gpt-4.1-mini",
  openaiConfigurada: () => Boolean(process.env.OPENAI_API_KEY),
}));

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
  chamarOpenaiJson.mockReset();
  delete process.env.IA_PROVEDOR_FORCADO;
  delete process.env.IA_ORDEM_PROVEDORES;
  /*
   * Os testes abaixo herdaram o cenário de quando havia cascata, e continuam
   * válidos: sem chave da OpenAI, os provedores de reserva assumem — é o
   * único caminho em que ainda existe cascata.
   */
  delete process.env.OPENAI_API_KEY;
  process.env.NVIDIA_API_KEY = "nvapi-teste";
  process.env.GEMINI_API_KEY = "gemini-teste";
  ({ chamarLlmJson } = await import("./llm"));
});

afterEach(() => {
  delete process.env.NVIDIA_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.IA_PROVEDOR_FORCADO;
  delete process.env.IA_ORDEM_PROVEDORES;
});

describe("Ordem dos provedores de reserva (só quando não há motor)", () => {
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

describe("Motor único", () => {
  const comMotor = async () => {
    process.env.OPENAI_API_KEY = "sk-teste";
    vi.resetModules();
    return import("./llm");
  };

  it("com a chave do motor, ninguém mais é chamado", async () => {
    /*
     * O ponto de toda a mudança: a cascata trocava de provedor no meio da
     * conversa e o cliente sentia — outro registro, outro jeito de
     * perguntar, mais informal. Uma conversa, uma voz.
     */
    const { chamarLlmJson: chamar } = await comMotor();
    chamarOpenaiJson.mockResolvedValue(ok("gpt-4.1-mini"));

    const r = await chamar("prompt");

    expect(r.ok && r.modelo).toBe("gpt-4.1-mini");
    expect(chamarGeminiJson).not.toHaveBeenCalled();
    expect(chamarGroqJson).not.toHaveBeenCalled();
    expect(chamarNvidiaJson).not.toHaveBeenCalled();
  });

  it("motor que falha vira CONTINGÊNCIA, não troca de voz", async () => {
    // Falha do motor é uma resposta que não veio — o cliente recebe o texto
    // de contingência, que é da mesma assistente. Cobrir com outro provedor
    // devolveria a resposta e tiraria a consistência, que é o que se está
    // comprando aqui.
    const { chamarLlmJson: chamar } = await comMotor();
    chamarOpenaiJson.mockResolvedValue(falha("http_429"));

    const r = await chamar("prompt");

    expect(r.ok).toBe(false);
    expect(chamarGeminiJson).not.toHaveBeenCalled();
  });

  it("o motor sozinho recebe a maior parte do orçamento — e sobra para a retentativa", async () => {
    // Com um provedor só, dividir o prazo em fatias de 40% deixaria tempo
    // para ninguém gastar. Mas 100% também não serve: sem folga, o erro que
    // falha rápido (5xx) nunca teria a segunda chance que `valeRetentar` promete.
    const { chamarLlmJson: chamar } = await comMotor();
    chamarOpenaiJson.mockResolvedValueOnce(falha("http_5xx"));
    chamarOpenaiJson.mockResolvedValueOnce(ok("gpt-4.1-mini"));

    const r = await chamar("prompt", { orcamentoMs: 20_000 });

    expect(r.ok).toBe(true);
    const teto = chamarOpenaiJson.mock.calls[0][1].timeoutMs;
    expect(teto).toBeGreaterThan(20_000 * 0.4);
    expect(teto).toBeLessThan(20_000);
    expect(chamarOpenaiJson).toHaveBeenCalledTimes(2);
  });

  it("a tela de diagnóstico mostra QUEM RESPONDE, não quem tem chave", async () => {
    // Em produção as quatro chaves existem na Vercel. Listar as quatro faria
    // o corretor procurar defeito num provedor que não atende ninguém.
    process.env.GROQ_API_KEY = "gsk-teste";
    const { provedoresDisponiveis } = await comMotor();
    expect(provedoresDisponiveis()).toEqual(["openai"]);
    delete process.env.GROQ_API_KEY;
  });

  it("sem chave do motor, a reserva assume — melhor voz trocada que silêncio", async () => {
    // Ausência de motor é ambiente desconfigurado, não modo de operação: a
    // escolha aqui é entre a voz de outro provedor e não responder nada.
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    expect(ordemDosProvedores().map((p) => p.nome)).toEqual(["groq", "gemini", "nvidia"]);
  });
});

describe("IA_ORDEM_PROVEDORES (eval e benchmark)", () => {
  it("a lista pedida vale exatamente como escrita", async () => {
    // O eval precisa medir UM provedor. Completar a lista com os que
    // faltam, como se fazia, faria outro provedor responder por baixo e o
    // score sair de uma mistura.
    process.env.OPENAI_API_KEY = "sk-teste";
    process.env.IA_ORDEM_PROVEDORES = "gemini";
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    expect(ordemDosProvedores().map((p) => p.nome)).toEqual(["gemini"]);
  });

  it("nome desconhecido é ignorado, o resto vale", async () => {
    process.env.IA_ORDEM_PROVEDORES = "openai, xpto ,,gemini";
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    expect(ordemDosProvedores().map((p) => p.nome)).toEqual(["openai", "gemini"]);
  });

  it("repetido não duplica", async () => {
    process.env.IA_ORDEM_PROVEDORES = "openai,openai";
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    expect(ordemDosProvedores()).toHaveLength(1);
  });

  it("typo em TUDO cai no padrão em vez de deixar o atendimento sem motor", async () => {
    process.env.OPENAI_API_KEY = "sk-teste";
    process.env.IA_ORDEM_PROVEDORES = "xpto,fulano";
    vi.resetModules();
    const { ordemDosProvedores } = await import("./llm");
    expect(ordemDosProvedores().map((p) => p.nome)).toEqual(["openai"]);
  });
});

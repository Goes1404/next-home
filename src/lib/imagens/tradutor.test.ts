import { beforeEach, describe, expect, it, vi } from "vitest";

const chamarLlmJson = vi.fn();
vi.mock("@/lib/whatsapp/llm", () => ({
  chamarLlmJson: (...args: unknown[]) => chamarLlmJson(...args),
}));

const { traduzirPedido } = await import("./tradutor");

function respostaOk(prompt: string) {
  return {
    ok: true,
    json: { prompt },
    latenciaMs: 1200,
    tokensEntrada: 300,
    tokensSaida: 120,
    modelo: "gpt-4.1-mini",
  };
}

const BOM =
  "Fachada de edifício residencial alto vista da calçada em leve contra-plongée, " +
  "fim de tarde com luz quente e rasante, concreto claro e vidro refletivo, " +
  "paisagismo tropical no térreo. Sem pessoas com rosto reconhecível e sem texto na cena.";

beforeEach(() => chamarLlmJson.mockReset());

describe("o tradutor devolve português, e é ele que vai", () => {
  it("usa o texto do modelo quando ele responde", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    const r = await traduzirPedido({ pedido: "fachada bonita", fatos: [] });
    expect(r.prompt).toBe(BOM);
    expect(r.daIa).toBe(true);
  });

  it("os fatos do imóvel entram no prompt DO MOTOR", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "post do Dom Parque", fatos: ["Empreendimento: Dom Parque"] });
    expect(chamarLlmJson.mock.calls[0][0]).toContain("Dom Parque");
  });

  /*
   * Regressão de 10/09/2026, achada por um `no-unused-vars`. O caminho antigo
   * (`montarPromptFinal`) consumia as escolhas de chip; ao trocá-lo pelo
   * tradutor, elas passaram a ser coletadas e JOGADAS FORA — o corretor
   * respondia a pergunta e a resposta não chegava a lugar nenhum. Pergunta que
   * não muda o resultado é pior que pergunta nenhuma: cobra um toque e mente.
   */
  it("as escolhas de chip entram no prompt DO MOTOR, com a pergunta junto", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({
      pedido: "fachada do Dom Parque",
      fatos: [],
      respostas: [{ pergunta: "Que hora do dia?", escolha: "Pôr do sol" }],
    });
    const enviado = String(chamarLlmJson.mock.calls[0][0]);
    expect(enviado).toContain("Pôr do sol");
    expect(enviado).toContain("Que hora do dia?");
  });

  it("escolha em branco não vira linha no prompt", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({
      pedido: "fachada",
      fatos: [],
      respostas: [{ pergunta: "Que hora do dia?", escolha: "   " }],
    });
    expect(String(chamarLlmJson.mock.calls[0][0])).not.toContain("já respondeu");
  });

  it("a instrução da gramática viaja junto — senão o modelo não sabe o que cobrir", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "fachada", fatos: [] });
    const enviado = String(chamarLlmJson.mock.calls[0][0]).toLowerCase();
    expect(enviado).toContain("restrições");
    expect(enviado).toContain("soletr");
  });
});

describe("falha do motor é degradação DECLARADA", () => {
  it("motor fora do ar devolve o texto do corretor com daIa false", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "sem_api_key", latenciaMs: 0 });
    const r = await traduzirPedido({ pedido: "fachada bonita ao entardecer", fatos: [] });
    expect(r.prompt).toBe("fachada bonita ao entardecer");
    expect(r.daIa).toBe(false);
  });

  it("resposta curta demais é RECUSADA — trocar o texto do corretor por duas palavras é pior que não tentar", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk("um prédio"));
    const r = await traduzirPedido({ pedido: "fachada bonita ao entardecer", fatos: [] });
    expect(r.daIa).toBe(false);
    expect(r.prompt).toBe("fachada bonita ao entardecer");
  });

  it("JSON sem o campo esperado também cai na reserva", async () => {
    chamarLlmJson.mockResolvedValue({ ...respostaOk(""), json: { outro: "coisa" } });
    const r = await traduzirPedido({ pedido: "fachada bonita ao entardecer", fatos: [] });
    expect(r.daIa).toBe(false);
  });
});

describe("o portão", () => {
  it("marca abaixoDoPiso para o caso `Torre.`", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "http_5xx", latenciaMs: 10 });
    const r = await traduzirPedido({ pedido: "Torre.", fatos: [] });
    expect(r.abaixoDoPiso).toBe(true);
  });

  it("prompt completo não fica abaixo do piso nem tem pendência", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    const r = await traduzirPedido({ pedido: "fachada", fatos: [] });
    expect(r.abaixoDoPiso).toBe(false);
    expect(r.naoCobriu).toEqual([]);
  });

  it("ajuste parte do prompt ANTERIOR, não do zero", async () => {
    chamarLlmJson.mockResolvedValue(respostaOk(BOM));
    await traduzirPedido({ pedido: "mais claro", fatos: [], promptAnterior: BOM });
    const enviado = String(chamarLlmJson.mock.calls[0][0]);
    expect(enviado).toContain(BOM);
    expect(enviado.toLowerCase()).toContain("mude apenas");
  });

  it("pedido vazio não gasta chamada nenhuma", async () => {
    const r = await traduzirPedido({ pedido: "   ", fatos: [] });
    expect(chamarLlmJson).not.toHaveBeenCalled();
    expect(r.prompt).toBe("");
    expect(r.abaixoDoPiso).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chamarOpenaiJson } from "./openai";

/**
 * O adaptador da OpenAI é o único da cascata que sabe OLHAR para uma imagem,
 * e é isso que o tradutor de prompt de imagem passou a usar em 15/09/2026.
 * O que estes testes travam é o formato do corpo: o contrato de visão da API
 * é um ARRAY de partes, e mandar a string de sempre com as fotos ao lado
 * devolve a mesma coisa de antes — um modelo que não viu nada.
 */

const respostaBoa = {
  ok: true,
  json: async () => ({
    choices: [{ message: { content: '{"prompt":"ok"}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  }),
  text: async () => "",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.OPENAI_API_KEY = "sk-teste";
  fetchMock = vi.fn().mockResolvedValue(respostaBoa);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  vi.unstubAllGlobals();
});

function corpoEnviado() {
  return JSON.parse(String(fetchMock.mock.calls[0][1].body));
}

describe("sem imagem, o corpo é o de sempre", () => {
  it("o conteúdo do usuário continua sendo uma string", async () => {
    await chamarOpenaiJson("escreva algo", { timeoutMs: 5000 });

    const corpo = corpoEnviado();
    expect(typeof corpo.messages[1].content).toBe("string");
    expect(corpo.messages[1].content).toBe("escreva algo");
  });

  it("lista de imagens vazia não vira array de partes", async () => {
    await chamarOpenaiJson("escreva algo", { timeoutMs: 5000, imagens: [] });

    expect(typeof corpoEnviado().messages[1].content).toBe("string");
  });
});

describe("com imagem, o conteúdo vira partes — é o contrato de visão", () => {
  it("cada foto entra como `image_url`, e o texto vai junto", async () => {
    await chamarOpenaiJson("compare as fotos", {
      timeoutMs: 5000,
      imagens: ["https://sto/a.jpg", "https://sto/b.jpg"],
    });

    const partes = corpoEnviado().messages[1].content;
    expect(Array.isArray(partes)).toBe(true);

    const imagens = partes.filter((p: { type: string }) => p.type === "image_url");
    expect(imagens.map((p: { image_url: { url: string } }) => p.image_url.url)).toEqual([
      "https://sto/a.jpg",
      "https://sto/b.jpg",
    ]);

    const textos = partes.filter((p: { type: string }) => p.type === "text");
    expect(textos[textos.length - 1].text).toBe("compare as fotos");
  });

  it("as fotos são NUMERADAS, na ordem recebida", async () => {
    await chamarOpenaiJson("x", {
      timeoutMs: 5000,
      imagens: ["https://sto/a.jpg", "https://sto/b.jpg"],
    });

    const partes = corpoEnviado().messages[1].content as { type: string; text?: string }[];
    const rotulos = partes.filter((p) => p.type === "text" && p.text?.startsWith("Foto "));
    expect(rotulos.map((p) => p.text)).toEqual(["Foto 1 de 2:", "Foto 2 de 2:"]);
  });

  it("a imagem vem ANTES do texto do pedido", async () => {
    await chamarOpenaiJson("o pedido", { timeoutMs: 5000, imagens: ["https://sto/a.jpg"] });

    const partes = corpoEnviado().messages[1].content as { type: string; text?: string }[];
    const posicaoDaImagem = partes.findIndex((p) => p.type === "image_url");
    const posicaoDoPedido = partes.findIndex((p) => p.text === "o pedido");
    expect(posicaoDaImagem).toBeLessThan(posicaoDoPedido);
  });

  it("pede detalhe BAIXO — 85 tokens fixos por foto, e é assunto que se quer ver", async () => {
    await chamarOpenaiJson("x", { timeoutMs: 5000, imagens: ["https://sto/a.jpg"] });

    const partes = corpoEnviado().messages[1].content as {
      type: string;
      image_url?: { detail: string };
    }[];
    expect(partes.find((p) => p.type === "image_url")?.image_url?.detail).toBe("low");
  });
});

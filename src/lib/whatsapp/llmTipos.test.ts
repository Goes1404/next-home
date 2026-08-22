import { describe, expect, it } from "vitest";
import { extrairJsonDeTexto, motivoDoStatus, valeRetentar } from "./llmTipos";

describe("Extração de JSON de resposta em texto livre", () => {
  // O Gemini devolve JSON limpo por contrato (responseMimeType). A NVIDIA é
  // OpenAI-compatível e `response_format` não vale para todo modelo — então
  // é aqui que se decide se a resposta dela vira atendimento ou contingência.

  it("JSON limpo passa direto", () => {
    expect(extrairJsonDeTexto('{"textoResposta":"oi"}')).toEqual({ textoResposta: "oi" });
  });

  it("tira a cerca de código com a linguagem anotada", () => {
    const bruto = '```json\n{"textoResposta":"oi","sugerirVisita":true}\n```';
    expect(extrairJsonDeTexto(bruto)).toEqual({ textoResposta: "oi", sugerirVisita: true });
  });

  it("tira a cerca sem linguagem anotada", () => {
    expect(extrairJsonDeTexto('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignora a frase de cortesia antes e depois do JSON", () => {
    const bruto = 'Claro! Aqui está a resposta:\n{"a":1}\nEspero ter ajudado!';
    expect(extrairJsonDeTexto(bruto)).toEqual({ a: 1 });
  });

  it("preserva objetos ANINHADOS — o contrato do agente tem visitaProposta", () => {
    // Um regex guloso pararia no primeiro `}` e devolveria JSON truncado.
    const bruto =
      'Segue:\n{"textoResposta":"ok","visitaProposta":{"dataHoraISO":"2026-08-25T14:00:00Z","confirmadaPeloCliente":true},"anexosMidia":[]}';
    expect(extrairJsonDeTexto(bruto)).toEqual({
      textoResposta: "ok",
      visitaProposta: { dataHoraISO: "2026-08-25T14:00:00Z", confirmadaPeloCliente: true },
      anexosMidia: [],
    });
  });

  it("não se perde com chaves DENTRO de string", () => {
    const bruto = '{"textoResposta":"o cliente disse } e depois {","ok":true}';
    expect(extrairJsonDeTexto(bruto)).toEqual({
      textoResposta: "o cliente disse } e depois {",
      ok: true,
    });
  });

  it("não se perde com aspas escapadas dentro do texto", () => {
    const bruto = '{"textoResposta":"ele falou \\"quero 3 suítes\\" ontem"}';
    expect(extrairJsonDeTexto(bruto)).toEqual({
      textoResposta: 'ele falou "quero 3 suítes" ontem',
    });
  });

  it("texto sem JSON nenhum falha explicitamente, sem devolver meia resposta", () => {
    expect(extrairJsonDeTexto("Desculpe, não posso ajudar com isso.")).toBeNull();
    expect(extrairJsonDeTexto("")).toBeNull();
  });

  it("JSON truncado no meio falha em vez de virar objeto pela metade", () => {
    expect(extrairJsonDeTexto('{"textoResposta":"come')).toBeNull();
  });
});

describe("Classificação e retentativa", () => {
  it("separa cota de erro de chave", () => {
    expect(motivoDoStatus(429)).toBe("http_429");
    expect(motivoDoStatus(401)).toBe("http_4xx");
    expect(motivoDoStatus(503)).toBe("http_5xx");
  });

  it("cota e timeout não repetem no MESMO provedor — quem cobre é a cascata", () => {
    expect(valeRetentar("http_429")).toBe(false);
    expect(valeRetentar("timeout")).toBe(false);
    expect(valeRetentar("sem_api_key")).toBe(false);
    expect(valeRetentar("http_5xx")).toBe(true);
  });
});

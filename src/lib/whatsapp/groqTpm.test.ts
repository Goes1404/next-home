import { afterEach, describe, expect, it } from "vitest";
import { limiteTpmGroq, promptCabeNaGroq } from "./groq";

const original = process.env.GROQ_TPM_LIMITE;
afterEach(() => {
  if (original === undefined) delete process.env.GROQ_TPM_LIMITE;
  else process.env.GROQ_TPM_LIMITE = original;
});

/**
 * Os tamanhos abaixo são os REAIS, tirados dos logs de produção de
 * 24/08/2026 e da telemetria de `ia_interacoes`:
 *
 *   HTTP 413: "Limit 8000, Requested 8123"  (e 8080, 11694, 11894)
 *
 * A Groq atendeu pela última vez na v5 do prompt, com 4.719 tokens de
 * entrada. Da v6 em diante o prompt passou do teto e ela devolve 413 em
 * TODA mensagem — sem ninguém perceber, porque a telemetria só grava quem
 * respondeu, nunca quem foi descartado.
 */
const CHARS_POR_TOKEN = 3.6;
const promptDe = (tokens: number) => "a".repeat(Math.round(tokens * CHARS_POR_TOKEN));

describe("Prompt cabe no orçamento de tokens da Groq", () => {
  it("aceita o tamanho da v5, quando a Groq de fato respondia", () => {
    expect(promptCabeNaGroq(promptDe(4719))).toBe(true);
  });

  it("recusa o tamanho da v9/v11, que produz o HTTP 413 em produção", () => {
    expect(promptCabeNaGroq(promptDe(8372))).toBe(false);
    expect(promptCabeNaGroq(promptDe(8561))).toBe(false);
  });

  /*
   * A reserva de saída existe porque o teto é da JANELA de um minuto e
   * conta a resposta junto. Um prompt de 7.900 tokens "cabe" na conta
   * ingênua e estoura assim que o modelo escreve a primeira linha.
   */
  it("reserva espaço para a resposta, não só para o prompt", () => {
    expect(promptCabeNaGroq(promptDe(7900))).toBe(false);
    expect(promptCabeNaGroq(promptDe(7000))).toBe(true);
  });

  it("respeita o limite da conta quando ela sobe de tier", () => {
    process.env.GROQ_TPM_LIMITE = "30000";
    expect(limiteTpmGroq()).toBe(30_000);
    expect(promptCabeNaGroq(promptDe(8561))).toBe(true);
  });

  it("cai no padrão de 8.000 diante de valor inválido", () => {
    process.env.GROQ_TPM_LIMITE = "abacaxi";
    expect(limiteTpmGroq()).toBe(8_000);
    process.env.GROQ_TPM_LIMITE = "0";
    expect(limiteTpmGroq()).toBe(8_000);
  });
});

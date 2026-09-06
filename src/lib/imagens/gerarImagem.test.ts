import { describe, expect, it } from "vitest";
import { motivoDoErro } from "./gerarImagem";
import { inicioDoDiaEmSaoPaulo } from "./imagensTipos";

/**
 * A classificação do erro é a parte que erra, não o `fetch` — por isso ela é
 * função exportada e testada sem rede.
 *
 * O que está em jogo não é taxonomia: `sem_credito` e `recusado` viram frases
 * DIFERENTES na tela. A chave desta conta já ficou sem crédito uma vez, no
 * meio de uma medição, e "não deu para gerar" não diz a ninguém que falta
 * pagar. Recusa do modelo, por sua vez, não é defeito — é resposta, e quem
 * pediu precisa saber o que mudar.
 */

describe("motivoDoErro", () => {
  it("falta de crédito é um motivo próprio, não um 429 qualquer", () => {
    const corpo = JSON.stringify({
      error: { code: "insufficient_quota", message: "You exceeded your current quota" },
    });
    expect(motivoDoErro(429, corpo)).toBe("sem_credito");
  });

  it("limite de faturamento também é falta de crédito", () => {
    expect(motivoDoErro(400, '{"error":{"code":"billing_hard_limit_reached"}}')).toBe(
      "sem_credito",
    );
  });

  it("recusa do modelo é desfecho, não erro genérico", () => {
    expect(motivoDoErro(400, '{"error":{"code":"moderation_blocked"}}')).toBe("recusado");
    expect(motivoDoErro(400, '{"error":{"type":"image_generation_user_error"}}')).toBe("recusado");
  });

  it("429 sem menção a cota continua sendo excesso de chamadas", () => {
    expect(motivoDoErro(429, '{"error":{"message":"Rate limit reached"}}')).toBe("http_429");
  });

  it("separa 5xx de 4xx", () => {
    expect(motivoDoErro(500, "{}")).toBe("http_5xx");
    expect(motivoDoErro(503, "{}")).toBe("http_5xx");
    expect(motivoDoErro(401, '{"error":{"message":"Incorrect API key"}}')).toBe("http_4xx");
  });

  it("a classificação não depende de caixa alta ou baixa", () => {
    expect(motivoDoErro(429, '{"error":{"code":"INSUFFICIENT_QUOTA"}}')).toBe("sem_credito");
  });
});

describe("inicioDoDiaEmSaoPaulo", () => {
  it("usa o dia de São Paulo, não o de UTC", () => {
    // 03/09 às 01:30 UTC ainda é 02/09 às 22:30 em Brasília. Se a conta saísse
    // de UTC, o teto zeraria três horas cedo e quem tivesse gerado vinte
    // imagens à noite ganharia vinte de novo.
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-09-03T01:30:00Z"))).toBe(
      "2026-09-02T00:00:00-03:00",
    );
  });

  it("vira o dia à meia-noite de Brasília, não à de UTC", () => {
    // 03:00 UTC = 00:00 em Brasília: aqui sim o dia virou.
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-09-03T03:00:00Z"))).toBe(
      "2026-09-03T00:00:00-03:00",
    );
    expect(inicioDoDiaEmSaoPaulo(new Date("2026-09-03T02:59:00Z"))).toBe(
      "2026-09-02T00:00:00-03:00",
    );
  });

  it("devolve um instante que o Postgres compara sem ambiguidade", () => {
    const iso = inicioDoDiaEmSaoPaulo(new Date("2026-09-03T12:00:00Z"));
    expect(new Date(iso).toISOString()).toBe("2026-09-03T03:00:00.000Z");
  });
});

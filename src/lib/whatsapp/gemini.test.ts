import { describe, expect, it } from "vitest";
import { motivoDoStatus, valeRetentar, TIMEOUT_AGENTE_MS, TIMEOUT_DOSSIE_MS } from "./gemini";

describe("Classificação da falha do Gemini", () => {
  it("separa cota de erro de chave — são conversas diferentes com o corretor", () => {
    expect(motivoDoStatus(429)).toBe("http_429");
    expect(motivoDoStatus(403)).toBe("http_4xx");
    expect(motivoDoStatus(400)).toBe("http_4xx");
  });

  it("5xx é instabilidade do provedor", () => {
    expect(motivoDoStatus(500)).toBe("http_5xx");
    expect(motivoDoStatus(503)).toBe("http_5xx");
  });
});

describe("Quando vale retentar", () => {
  it("NÃO retenta timeout — foi isso que gastou 16,5s para chegar ao mesmo fallback", () => {
    // A telemetria de produção registrou 8000 + 500 + 8000 numa única
    // interação do playground, com o corretor esperando na tela.
    expect(valeRetentar("timeout")).toBe(false);
  });

  it("não retenta o que daria a mesma resposta", () => {
    expect(valeRetentar("sem_api_key")).toBe(false);
    expect(valeRetentar("http_4xx")).toBe(false);
    expect(valeRetentar("http_429")).toBe(false);
  });

  it("retenta o que falha rápido", () => {
    expect(valeRetentar("http_5xx")).toBe(true);
    expect(valeRetentar("resposta_vazia")).toBe(true);
  });
});

describe("Orçamento de tempo", () => {
  it("dá folga real sobre a maior latência já vista em produção (6948ms)", () => {
    expect(TIMEOUT_AGENTE_MS).toBeGreaterThanOrEqual(6948 * 2);
  });

  it("cabe no teto de 60s do webhook junto com o resto do fluxo", () => {
    // 6s de espera de rajada + agente + ~5s de envios + dossiê.
    const pior = 6_000 + TIMEOUT_AGENTE_MS + 5_000 + TIMEOUT_DOSSIE_MS;
    expect(pior).toBeLessThan(60_000);
  });

  it("o dossiê espera menos que o agente — ninguém está olhando para ele", () => {
    expect(TIMEOUT_DOSSIE_MS).toBeLessThan(TIMEOUT_AGENTE_MS);
  });
});

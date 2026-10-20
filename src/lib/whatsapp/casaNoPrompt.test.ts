import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { construirPromptSistema } from "./aiAgent";
import { blocoDaJogada } from "./jogada";

/**
 * A identidade da casa no prompt (fase 4 enxuta, 20/10/2026).
 *
 * O instantâneo foi gravado ANTES da mudança: o grupo 1 (Next Home) tem de
 * sair letra por letra igual, porque o prompt dele foi medido e o
 * `PROMPT_VERSAO` não muda.
 */
const base = {
  nomeCorretor: "Cristal - Bruna",
  slugCorretor: "cristal-bruna",
  creciCorretor: "254161",
  telefoneCorretor: "5511999999999",
  nomeAssistente: "Lia",
  tomVoz: "consultivo_alto_padrao",
  historicoMensagens: [] as { remetente: "cliente" | "bot" | "corretor"; texto: string }[],
  catalogo: [],
};

describe("o prompt do grupo 1", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("sai igual ao de antes da fase 4", () => {
    expect(construirPromptSistema({ ...base })).toMatchSnapshot();
  });

  it("a pergunta de região do planner sai igual", () => {
    expect(blocoDaJogada({ tipo: "perguntar", assunto: "regiao" }, { nomeDoFoco: null })).toMatchSnapshot();
  });
});

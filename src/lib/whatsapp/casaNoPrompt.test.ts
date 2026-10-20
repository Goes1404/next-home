import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { construirPromptSistema } from "./aiAgent";
import { blocoDaJogada } from "./jogada";
import { CASA_NEXT_HOME, casaDoGrupo } from "./casa";

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

describe("o prompt de outro grupo", () => {
  const casa = casaDoGrupo(
    { nome: "Horizonte", ia_nome_da_casa: null, ia_nome_assistente: null, ia_regiao: "Campinas", ia_tom: null },
    "00000000-0000-0000-0000-0000000000b2",
  );

  it("o grupo 1 explícito é o mesmo prompt de quem não passa casa", () => {
    expect(construirPromptSistema({ ...base, casa: CASA_NEXT_HOME })).toBe(construirPromptSistema({ ...base }));
  });

  it("não fala de Next Home, Barueri nem Alphaville", () => {
    const prompt = construirPromptSistema({ ...base, casa });
    expect(prompt).not.toMatch(/Next Home|Barueri|Alphaville|Tambor|Parque Shopping/);
    // Imóveis, lugares e o piso da Next Home usados como exemplo nas regras.
    expect(prompt).not.toMatch(/Terra Alta|\bViva\b|Vitra|Empresarial|470\.000|Dom Barueri|Manac/);
    expect(prompt).toContain("consultora de imóveis de alto padrão da Horizonte em Campinas,");
    expect(prompt).toContain('"em qual região de Campinas você procura?"');
    expect(prompt).toContain("apresentação digital da Horizonte.");
  });

  it("sem região configurada, a pergunta pede cidade ou bairro", () => {
    const semRegiao = casaDoGrupo(
      { nome: "Horizonte", ia_nome_da_casa: null, ia_nome_assistente: null, ia_regiao: null, ia_tom: null },
      "00000000-0000-0000-0000-0000000000b2",
    );
    const prompt = construirPromptSistema({ ...base, casa: semRegiao });
    expect(prompt).toContain("consultora de imóveis de alto padrão da Horizonte, atendendo");
    expect(prompt).toContain('"em qual cidade ou bairro você procura?"');
  });

  it("a pergunta de região do planner usa a região do grupo", () => {
    const bloco = blocoDaJogada({ tipo: "perguntar", assunto: "regiao" }, { nomeDoFoco: null, casa });
    expect(bloco).toContain("em qual região de Campinas ele procura");
    expect(bloco).not.toContain("Barueri");
  });
});

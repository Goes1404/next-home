import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { construirPromptSistema } from "./aiAgent";
import { CASA_NEXT_HOME, casaDoGrupo } from "./casa";
import { RAMOS } from "@/lib/ramos/ramos";

/**
 * O ramo da conta na IA do WhatsApp (29/10/2026, 0244).
 *
 * A guarda mais importante: a IMOBILIÁRIA sai byte a byte igual. O prompt
 * dela foi medido em produção (e o instantâneo de `casaNoPrompt.test.ts`
 * segura o grupo 1); aqui o mesmo vale para a imobiliária de outro grupo, com
 * e sem a coluna `ramo` na linha lida.
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

const OUTRO_GRUPO = "00000000-0000-0000-0000-0000000000b2";
const linha = (extra: Record<string, unknown> = {}) => ({
  nome: "Horizonte",
  ia_nome_da_casa: null,
  ia_nome_assistente: null,
  ia_regiao: "Campinas",
  ia_tom: null,
  ...extra,
});

describe("o prompt da imobiliária não muda com o ramo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("a casa da imobiliária tem as mesmas chaves de antes da 0244", () => {
    expect(casaDoGrupo(linha({ ramo: "imobiliaria", ramo_descricao: null }), OUTRO_GRUPO)).toEqual(
      casaDoGrupo(linha(), OUTRO_GRUPO),
    );
    expect("ramo" in casaDoGrupo(linha({ ramo: "imobiliaria" }), OUTRO_GRUPO)).toBe(false);
  });

  it("imobiliária com a coluna ramo = o prompt de antes, byte a byte", () => {
    const antes = construirPromptSistema({ ...base, casa: casaDoGrupo(linha(), OUTRO_GRUPO) });
    const depois = construirPromptSistema({
      ...base,
      casa: casaDoGrupo(linha({ ramo: "imobiliaria", ramo_descricao: null }), OUTRO_GRUPO),
    });
    expect(depois).toBe(antes);
    expect(depois).toContain("consultora de imóveis de alto padrão");
    expect(depois).toContain("CRECI 254161");
  });

  it("ramo desconhecido vale imobiliária (o prompt de sempre)", () => {
    const antes = construirPromptSistema({ ...base, casa: casaDoGrupo(linha(), OUTRO_GRUPO) });
    expect(construirPromptSistema({ ...base, casa: casaDoGrupo(linha({ ramo: "astronautica" }), OUTRO_GRUPO) })).toBe(antes);
  });

  it("a Next Home é imobiliária mesmo que a linha diga outro ramo", () => {
    const grupo1 = "00000000-0000-0000-0000-000000000001";
    const casa = casaDoGrupo(
      { nome: "Next Home", ia_nome_da_casa: null, ia_nome_assistente: null, ia_regiao: null, ia_tom: null, ramo: "seguros" },
      grupo1,
    );
    expect(casa.ramo).toBeUndefined();
    expect(construirPromptSistema({ ...base, casa: CASA_NEXT_HOME })).toBe(construirPromptSistema({ ...base }));
  });
});

describe("o prompt dos outros ramos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  for (const ramo of RAMOS.filter((r) => r !== "imobiliaria")) {
    it(`${ramo}: sem imóvel, CRECI nem dormitório; mesmo contrato JSON`, () => {
      const casa = casaDoGrupo(
        linha({ ramo, ramo_descricao: ramo === "outro" ? "Clínica veterinária" : null }),
        OUTRO_GRUPO,
      );
      expect(casa.ramo).toBe(ramo);
      const prompt = construirPromptSistema({ ...base, casa });
      expect(prompt).not.toMatch(/imóve|CRECI|dormit|decorado|empreendimento de alto|Next Home|Barueri/i);
      expect(prompt).toContain("Você é Lia,");
      expect(prompt).toContain("da Horizonte em Campinas");
      // O contrato de saída é o mesmo que o turno lê.
      for (const campo of ["textoResposta", "transferirHumano", "visitaProposta", "anexosMidia", "mandarCatalogo"]) {
        expect(prompt).toContain(`"${campo}"`);
      }
    });
  }

  it("advocacia: o papel, a consulta e o que qualificar vêm do ramo", () => {
    const prompt = construirPromptSistema({ ...base, casa: casaDoGrupo(linha({ ramo: "advocacia" }), OUTRO_GRUPO) });
    expect(prompt).toContain("escritório de advocacia");
    expect(prompt).toContain("AGENDAMENTO — CONSULTA");
    expect(prompt).toMatch(/trabalhista/);
  });

  it("outro: o negócio é o que a conta escreveu", () => {
    const casa = casaDoGrupo(linha({ ramo: "outro", ramo_descricao: "Clínica veterinária" }), OUTRO_GRUPO);
    expect(construirPromptSistema({ ...base, casa })).toContain('do ramo "Clínica veterinária"');
  });

  it("as regras do corretor continuam entrando", () => {
    const casa = casaDoGrupo(linha({ ramo: "seguros" }), OUTRO_GRUPO);
    const prompt = construirPromptSistema({ ...base, casa, regrasDaIa: "Sempre pergunte a placa do carro." });
    expect(prompt).toContain("Sempre pergunte a placa do carro.");
  });
});

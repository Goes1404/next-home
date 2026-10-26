import { describe, expect, it } from "vitest";
import { normalizarLeituraDoRetorno } from "./leituraDoRetorno";

// segunda-feira, 26/10/2026 14:05 em São Paulo (UTC-3)
const AGORA = new Date("2026-10-26T17:05:00.000Z");
const SABADO_10H = "2026-10-31T10:00:00-03:00";

function leitura(extra: Record<string, unknown> = {}) {
  return { resultado: "atendeu", ...extra };
}

describe("normalizarLeituraDoRetorno", () => {
  it("devolve null para o que não é objeto", () => {
    expect(normalizarLeituraDoRetorno(null, AGORA)).toBeNull();
    expect(normalizarLeituraDoRetorno("atendeu", AGORA)).toBeNull();
    expect(normalizarLeituraDoRetorno([], AGORA)).toBeNull();
  });

  it("resultado desconhecido ou ausente devolve null", () => {
    expect(normalizarLeituraDoRetorno({ resultado: "talvez" }, AGORA)).toBeNull();
    expect(normalizarLeituraDoRetorno({}, AGORA)).toBeNull();
  });

  it("aceita os quatro resultados", () => {
    for (const resultado of ["atendeu", "nao_atendeu", "numero_errado", "pediu_retorno"]) {
      expect(normalizarLeituraDoRetorno({ resultado }, AGORA)?.resultado).toBe(resultado);
    }
  });

  it("um relato sem nada além do resultado vira leitura vazia", () => {
    expect(normalizarLeituraDoRetorno(leitura(), AGORA)).toEqual({
      resultado: "atendeu",
      etapa: null,
      visitaEm: null,
      motivoPerda: null,
      resumo: null,
      proximoPasso: null,
      fatos: {},
    });
  });

  describe("etapa", () => {
    it("aceita as etapas que um relato de ligação pode definir", () => {
      for (const etapa of ["primeiro_contato", "em_conversa", "qualificado"]) {
        expect(normalizarLeituraDoRetorno(leitura({ etapa }), AGORA)?.etapa).toBe(etapa);
      }
    });

    it("etapa fora de ETAPAS_FUNIL vira null", () => {
      expect(normalizarLeituraDoRetorno(leitura({ etapa: "negociando" }), AGORA)?.etapa).toBeNull();
      expect(normalizarLeituraDoRetorno(leitura({ etapa: 3 }), AGORA)?.etapa).toBeNull();
    });

    it("a IA não leva o lead a fechado, documentacao ou proposta por um relato de ligação", () => {
      for (const etapa of ["fechado", "documentacao", "proposta"]) {
        expect(normalizarLeituraDoRetorno(leitura({ etapa }), AGORA)?.etapa).toBeNull();
      }
    });

    it("novo e visitou também não vêm de um relato de ligação", () => {
      expect(normalizarLeituraDoRetorno(leitura({ etapa: "novo" }), AGORA)?.etapa).toBeNull();
      expect(normalizarLeituraDoRetorno(leitura({ etapa: "visitou" }), AGORA)?.etapa).toBeNull();
    });

    it("perdido com motivo mantém a etapa e o motivo", () => {
      const l = normalizarLeituraDoRetorno(
        leitura({ etapa: "perdido", motivoPerda: " Comprou com outra imobiliária " }),
        AGORA,
      );
      expect(l?.etapa).toBe("perdido");
      expect(l?.motivoPerda).toBe("Comprou com outra imobiliária");
    });

    it("perdido sem motivoPerda vira etapa null", () => {
      expect(normalizarLeituraDoRetorno(leitura({ etapa: "perdido" }), AGORA)?.etapa).toBeNull();
      expect(
        normalizarLeituraDoRetorno(leitura({ etapa: "perdido", motivoPerda: "   " }), AGORA)?.etapa,
      ).toBeNull();
    });

    it("motivoPerda sem perdido é descartado", () => {
      const l = normalizarLeituraDoRetorno(leitura({ etapa: "em_conversa", motivoPerda: "preço" }), AGORA);
      expect(l?.motivoPerda).toBeNull();
    });

    it("visita_agendada com visita válida mantém etapa e visita", () => {
      const l = normalizarLeituraDoRetorno(leitura({ etapa: "visita_agendada", visitaEm: SABADO_10H }), AGORA);
      expect(l?.etapa).toBe("visita_agendada");
      expect(l?.visitaEm).toBe(new Date(SABADO_10H).toISOString());
    });

    it("visita_agendada sem visitaEm vira etapa null", () => {
      expect(normalizarLeituraDoRetorno(leitura({ etapa: "visita_agendada" }), AGORA)?.etapa).toBeNull();
    });

    it("visita_agendada com visita inválida vira etapa null", () => {
      const l = normalizarLeituraDoRetorno(
        leitura({ etapa: "visita_agendada", visitaEm: "2026-10-20T10:00:00-03:00" }),
        AGORA,
      );
      expect(l?.visitaEm).toBeNull();
      expect(l?.etapa).toBeNull();
    });

    it("nao_atendeu força etapa null", () => {
      const l = normalizarLeituraDoRetorno(
        { resultado: "nao_atendeu", etapa: "qualificado", visitaEm: SABADO_10H },
        AGORA,
      );
      expect(l?.etapa).toBeNull();
      expect(l?.visitaEm).toBeNull();
    });

    it("numero_errado força etapa null, sem visita e sem fatos", () => {
      const l = normalizarLeituraDoRetorno(
        {
          resultado: "numero_errado",
          etapa: "qualificado",
          visitaEm: SABADO_10H,
          fatos: { orcamentoMax: 600000 },
          orcamentoMax: 600000,
        },
        AGORA,
      );
      expect(l?.etapa).toBeNull();
      expect(l?.visitaEm).toBeNull();
      expect(l?.fatos).toEqual({});
    });
  });

  describe("visitaEm", () => {
    it("no passado vira null", () => {
      expect(
        normalizarLeituraDoRetorno(leitura({ visitaEm: "2026-10-26T10:00:00-03:00" }), AGORA)?.visitaEm,
      ).toBeNull();
    });

    it("a mais de 60 dias de agora vira null", () => {
      expect(
        normalizarLeituraDoRetorno(leitura({ visitaEm: "2027-01-10T10:00:00-03:00" }), AGORA)?.visitaEm,
      ).toBeNull();
    });

    it("dentro dos 60 dias vale", () => {
      const dentro = new Date(AGORA.getTime() + 59 * 24 * 3600_000).toISOString();
      expect(normalizarLeituraDoRetorno(leitura({ visitaEm: dentro }), AGORA)?.visitaEm).toBe(dentro);
    });

    it("texto que não é data vira null", () => {
      expect(normalizarLeituraDoRetorno(leitura({ visitaEm: "sábado de manhã" }), AGORA)?.visitaEm).toBeNull();
      expect(normalizarLeituraDoRetorno(leitura({ visitaEm: 1761900000 }), AGORA)?.visitaEm).toBeNull();
    });
  });

  describe("fatos", () => {
    it("aceita os fatos válidos e deixa de fora os ausentes e os null", () => {
      const l = normalizarLeituraDoRetorno(
        leitura({
          fatos: {
            orcamentoMin: null,
            orcamentoMax: 600000,
            rendaMensal: 12000,
            regiaoInteresse: " Alphaville ",
            dormitoriosMin: 3,
            formaPagamento: "financiamento",
            perfilFamiliar: "casal_com_filhos",
            urgenciaMudanca: "3_meses",
            exigenciasEspecificas: ["usa_fgts", " pet_friendly "],
            objecoesIdentificadas: ["preco"],
            temperaturaLabel: "quente",
          },
        }),
        AGORA,
      );
      expect(l?.fatos).toEqual({
        orcamentoMax: 600000,
        rendaMensal: 12000,
        regiaoInteresse: "Alphaville",
        dormitoriosMin: 3,
        formaPagamento: "financiamento",
        perfilFamiliar: "casal_com_filhos",
        urgenciaMudanca: "3_meses",
        exigenciasEspecificas: ["usa_fgts", "pet_friendly"],
        objecoesIdentificadas: ["preco"],
        temperaturaLabel: "quente",
      });
      expect(l?.fatos).not.toHaveProperty("orcamentoMin");
    });

    it("números negativos, zero, NaN e texto viram ausentes", () => {
      const l = normalizarLeituraDoRetorno(
        leitura({
          fatos: { orcamentoMin: -1, orcamentoMax: 0, rendaMensal: "600 mil", dormitoriosMin: -2 },
        }),
        AGORA,
      );
      expect(l?.fatos).toEqual({});
    });

    it("dormitórios fora de 1 a 10 ficam ausentes e fracionados são arredondados", () => {
      expect(normalizarLeituraDoRetorno(leitura({ fatos: { dormitoriosMin: 11 } }), AGORA)?.fatos).toEqual({});
      expect(normalizarLeituraDoRetorno(leitura({ fatos: { dormitoriosMin: 2.6 } }), AGORA)?.fatos).toEqual({
        dormitoriosMin: 3,
      });
    });

    it("valores fora do vocabulário ficam ausentes", () => {
      const l = normalizarLeituraDoRetorno(
        leitura({
          fatos: {
            formaPagamento: "cheque",
            perfilFamiliar: "viuvo",
            urgenciaMudanca: "ontem",
            temperaturaLabel: "fervendo",
          },
        }),
        AGORA,
      );
      expect(l?.fatos).toEqual({});
    });

    it("listas vazias ou sem texto ficam ausentes (lista vazia não apaga o que já se sabe)", () => {
      const l = normalizarLeituraDoRetorno(
        leitura({ fatos: { exigenciasEspecificas: [], objecoesIdentificadas: [1, "", "  "] } }),
        AGORA,
      );
      expect(l?.fatos).toEqual({});
    });

    it("fatos que não é objeto é ignorado", () => {
      expect(normalizarLeituraDoRetorno(leitura({ fatos: "3 quartos" }), AGORA)?.fatos).toEqual({});
    });
  });

  describe("textos", () => {
    it("apara e limita resumo e próximo passo", () => {
      const l = normalizarLeituraDoRetorno(
        leitura({ resumo: "  " + "a".repeat(3000), proximoPasso: " Ligar sábado " }),
        AGORA,
      );
      expect(l?.resumo?.length).toBe(1500);
      expect(l?.proximoPasso).toBe("Ligar sábado");
    });

    it("texto vazio ou de outro tipo vira null", () => {
      const l = normalizarLeituraDoRetorno(leitura({ resumo: "  ", proximoPasso: 5 }), AGORA);
      expect(l?.resumo).toBeNull();
      expect(l?.proximoPasso).toBeNull();
    });
  });
});

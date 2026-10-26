import { describe, expect, it } from "vitest";
import { normalizarLeituraDoRetorno, type LeituraDoRetorno } from "./leituraDoRetorno";

// segunda-feira, 26/10/2026 14:05 em São Paulo (UTC-3)
const AGORA = new Date("2026-10-26T17:05:00.000Z");
const SABADO_10H = "2026-10-31T10:00:00-03:00";

function leitura(extra: Record<string, unknown> = {}) {
  return { resultado: "atendeu", ...extra };
}

/** A leitura de um relato de verdade: aqui o modelo nunca responde "não é relato". */
function normalizar(json: unknown, agora: Date): LeituraDoRetorno | null {
  const lida = normalizarLeituraDoRetorno(json, agora);
  if (lida === "nao_e_relato") throw new Error("leitura inesperada: não é relato");
  return lida;
}

describe("normalizarLeituraDoRetorno", () => {
  it("devolve null para o que não é objeto", () => {
    expect(normalizar(null, AGORA)).toBeNull();
    expect(normalizar("atendeu", AGORA)).toBeNull();
    expect(normalizar([], AGORA)).toBeNull();
  });

  it("resultado desconhecido ou ausente devolve null", () => {
    expect(normalizar({ resultado: "talvez" }, AGORA)).toBeNull();
    expect(normalizar({}, AGORA)).toBeNull();
  });

  it("resultado null explícito: não é relato de ligação (conversa, \"ok\", recado ao gestor)", () => {
    expect(normalizarLeituraDoRetorno({ resultado: null }, AGORA)).toBe("nao_e_relato");
    expect(normalizarLeituraDoRetorno({ resultado: null, etapa: "perdido", motivoPerda: "x" }, AGORA)).toBe("nao_e_relato");
  });

  it("aceita os quatro resultados", () => {
    for (const resultado of ["atendeu", "nao_atendeu", "numero_errado", "pediu_retorno"]) {
      expect(normalizar({ resultado }, AGORA)?.resultado).toBe(resultado);
    }
  });

  it("um relato sem nada além do resultado vira leitura vazia", () => {
    expect(normalizar(leitura(), AGORA)).toEqual({
      resultado: "atendeu",
      etapa: null,
      visitaEm: null,
      motivoPerda: null,
      resumo: null,
      proximoPasso: null,
      fatos: {},
      visitaRecusada: false,
      perdaSemMotivo: false,
    });
  });

  describe("etapa", () => {
    it("aceita as etapas que um relato de ligação pode definir", () => {
      for (const etapa of ["primeiro_contato", "em_conversa", "qualificado"]) {
        expect(normalizar(leitura({ etapa }), AGORA)?.etapa).toBe(etapa);
      }
    });

    it("etapa fora de ETAPAS_FUNIL vira null", () => {
      expect(normalizar(leitura({ etapa: "negociando" }), AGORA)?.etapa).toBeNull();
      expect(normalizar(leitura({ etapa: 3 }), AGORA)?.etapa).toBeNull();
    });

    it("a IA não leva o lead a fechado, documentacao ou proposta por um relato de ligação", () => {
      for (const etapa of ["fechado", "documentacao", "proposta"]) {
        expect(normalizar(leitura({ etapa }), AGORA)?.etapa).toBeNull();
      }
    });

    it("novo e visitou também não vêm de um relato de ligação", () => {
      expect(normalizar(leitura({ etapa: "novo" }), AGORA)?.etapa).toBeNull();
      expect(normalizar(leitura({ etapa: "visitou" }), AGORA)?.etapa).toBeNull();
    });

    it("perdido com motivo mantém a etapa e o motivo", () => {
      const l = normalizar(
        leitura({ etapa: "perdido", motivoPerda: " Comprou com outra imobiliária " }),
        AGORA,
      );
      expect(l?.etapa).toBe("perdido");
      expect(l?.motivoPerda).toBe("Comprou com outra imobiliária");
    });

    it("perdido sem motivoPerda vira etapa null", () => {
      expect(normalizar(leitura({ etapa: "perdido" }), AGORA)?.etapa).toBeNull();
      expect(
        normalizar(leitura({ etapa: "perdido", motivoPerda: "   " }), AGORA)?.etapa,
      ).toBeNull();
    });

    it("perdido sem motivo avisa (perdaSemMotivo); com motivo, não", () => {
      expect(normalizar(leitura({ etapa: "perdido" }), AGORA)?.perdaSemMotivo).toBe(true);
      expect(normalizar(leitura({ etapa: "perdido", motivoPerda: "preço" }), AGORA)?.perdaSemMotivo).toBe(false);
      expect(normalizar(leitura({ etapa: "em_conversa" }), AGORA)?.perdaSemMotivo).toBe(false);
    });

    it("motivoPerda sem perdido é descartado", () => {
      const l = normalizar(leitura({ etapa: "em_conversa", motivoPerda: "preço" }), AGORA);
      expect(l?.motivoPerda).toBeNull();
    });

    it("visita_agendada com visita válida mantém etapa e visita", () => {
      const l = normalizar(leitura({ etapa: "visita_agendada", visitaEm: SABADO_10H }), AGORA);
      expect(l?.etapa).toBe("visita_agendada");
      expect(l?.visitaEm).toBe(new Date(SABADO_10H).toISOString());
    });

    it("visita que a peneira recusou avisa (visitaRecusada): passado, +60 dias, sem fuso, sem hora", () => {
      for (const visitaEm of ["2026-10-20T10:00:00-03:00", "2027-01-10T10:00:00-03:00", "2026-10-31T10:00:00", "2026-10-31"]) {
        expect(normalizar(leitura({ visitaEm }), AGORA)?.visitaRecusada, visitaEm).toBe(true);
      }
      // "visita marcada" sem dia e hora também não foi anotada.
      expect(normalizar(leitura({ etapa: "visita_agendada" }), AGORA)?.visitaRecusada).toBe(true);
      expect(normalizar(leitura({ etapa: "visita_agendada", visitaEm: SABADO_10H }), AGORA)?.visitaRecusada).toBe(false);
      expect(normalizar(leitura(), AGORA)?.visitaRecusada).toBe(false);
      // Não atendeu: a visita que o modelo inventou some sem aviso.
      expect(normalizar(leitura({ resultado: "nao_atendeu", visitaEm: SABADO_10H }), AGORA)?.visitaRecusada).toBe(false);
    });

    it("visita_agendada sem visitaEm vira etapa null", () => {
      expect(normalizar(leitura({ etapa: "visita_agendada" }), AGORA)?.etapa).toBeNull();
    });

    it("visita_agendada com visita inválida vira etapa null", () => {
      const l = normalizar(
        leitura({ etapa: "visita_agendada", visitaEm: "2026-10-20T10:00:00-03:00" }),
        AGORA,
      );
      expect(l?.visitaEm).toBeNull();
      expect(l?.etapa).toBeNull();
    });

    it("nao_atendeu força etapa null, sem visita e sem fatos", () => {
      const l = normalizar(
        {
          resultado: "nao_atendeu",
          etapa: "qualificado",
          visitaEm: SABADO_10H,
          fatos: { orcamentoMax: 600000, regiaoInteresse: "Alphaville" },
        },
        AGORA,
      );
      expect(l?.etapa).toBeNull();
      expect(l?.visitaEm).toBeNull();
      expect(l?.fatos).toEqual({});
    });

    it("numero_errado força etapa null, sem visita e sem fatos", () => {
      const l = normalizar(
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
        normalizar(leitura({ visitaEm: "2026-10-26T10:00:00-03:00" }), AGORA)?.visitaEm,
      ).toBeNull();
    });

    it("a mais de 60 dias de agora vira null", () => {
      expect(
        normalizar(leitura({ visitaEm: "2027-01-10T10:00:00-03:00" }), AGORA)?.visitaEm,
      ).toBeNull();
    });

    it("dentro dos 60 dias vale", () => {
      const dentro = new Date(AGORA.getTime() + 59 * 24 * 3600_000).toISOString();
      expect(normalizar(leitura({ visitaEm: dentro }), AGORA)?.visitaEm).toBe(dentro);
    });

    it("exatamente agora + 60 dias vale; um milissegundo a mais não", () => {
      const limite = AGORA.getTime() + 60 * 24 * 3600_000;
      expect(
        normalizar(leitura({ visitaEm: new Date(limite).toISOString() }), AGORA)?.visitaEm,
      ).toBe(new Date(limite).toISOString());
      expect(
        normalizar(leitura({ visitaEm: new Date(limite + 1).toISOString() }), AGORA)?.visitaEm,
      ).toBeNull();
    });

    it("igual a agora não vale (precisa ser depois); um milissegundo depois vale", () => {
      expect(normalizar(leitura({ visitaEm: AGORA.toISOString() }), AGORA)?.visitaEm).toBeNull();
      const logoDepois = new Date(AGORA.getTime() + 1).toISOString();
      expect(normalizar(leitura({ visitaEm: logoDepois }), AGORA)?.visitaEm).toBe(logoDepois);
    });

    it("sem fuso (offset) vira null: o servidor leria no fuso dele", () => {
      expect(normalizar(leitura({ visitaEm: "2026-10-31T10:00:00" }), AGORA)?.visitaEm).toBeNull();
      expect(normalizar(leitura({ visitaEm: "2026-10-31T10:00" }), AGORA)?.visitaEm).toBeNull();
    });

    it("só a data, sem hora, vira null", () => {
      expect(normalizar(leitura({ visitaEm: "2026-10-31" }), AGORA)?.visitaEm).toBeNull();
    });

    it("formato solto vira null", () => {
      expect(normalizar(leitura({ visitaEm: "Nov 7 2026 10:00" }), AGORA)?.visitaEm).toBeNull();
      expect(normalizar(leitura({ visitaEm: "31/10/2026 10:00" }), AGORA)?.visitaEm).toBeNull();
    });

    it("aceita offset, Z e fração de segundo", () => {
      expect(normalizar(leitura({ visitaEm: "2026-10-31T10:00-03:00" }), AGORA)?.visitaEm).toBe(
        "2026-10-31T13:00:00.000Z",
      );
      expect(normalizar(leitura({ visitaEm: "2026-10-31T13:00:00.000Z" }), AGORA)?.visitaEm).toBe(
        "2026-10-31T13:00:00.000Z",
      );
    });

    it("data impossível com formato certo vira null", () => {
      expect(
        normalizar(leitura({ visitaEm: "2026-13-45T10:00:00-03:00" }), AGORA)?.visitaEm,
      ).toBeNull();
    });

    it("texto que não é data vira null", () => {
      expect(normalizar(leitura({ visitaEm: "sábado de manhã" }), AGORA)?.visitaEm).toBeNull();
      expect(normalizar(leitura({ visitaEm: 1761900000 }), AGORA)?.visitaEm).toBeNull();
    });
  });

  describe("fatos", () => {
    it("aceita os fatos válidos e deixa de fora os ausentes e os null", () => {
      const l = normalizar(
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
      const l = normalizar(
        leitura({
          fatos: { orcamentoMin: -1, orcamentoMax: 0, rendaMensal: "600 mil", dormitoriosMin: -2 },
        }),
        AGORA,
      );
      expect(l?.fatos).toEqual({});
    });

    it("dormitórios fora de 1 a 10 ficam ausentes e fracionados são arredondados", () => {
      expect(normalizar(leitura({ fatos: { dormitoriosMin: 11 } }), AGORA)?.fatos).toEqual({});
      expect(normalizar(leitura({ fatos: { dormitoriosMin: 2.6 } }), AGORA)?.fatos).toEqual({
        dormitoriosMin: 3,
      });
    });

    it("valores fora do vocabulário ficam ausentes", () => {
      const l = normalizar(
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
      const l = normalizar(
        leitura({ fatos: { exigenciasEspecificas: [], objecoesIdentificadas: [1, "", "  "] } }),
        AGORA,
      );
      expect(l?.fatos).toEqual({});
    });

    it("fatos que não é objeto é ignorado", () => {
      expect(normalizar(leitura({ fatos: "3 quartos" }), AGORA)?.fatos).toEqual({});
    });
  });

  describe("textos", () => {
    it("apara e limita resumo e próximo passo", () => {
      const l = normalizar(
        leitura({ resumo: "  " + "a".repeat(3000), proximoPasso: " Ligar sábado " }),
        AGORA,
      );
      expect(l?.resumo?.length).toBe(1500);
      expect(l?.proximoPasso).toBe("Ligar sábado");
    });

    it("texto vazio ou de outro tipo vira null", () => {
      const l = normalizar(leitura({ resumo: "  ", proximoPasso: 5 }), AGORA);
      expect(l?.resumo).toBeNull();
      expect(l?.proximoPasso).toBeNull();
    });
  });
});

import { describe, expect, it } from "vitest";
import type { LeituraDoRetorno } from "./leituraDoRetorno";
import {
  TEXTO_AUDIO_NAO_ENTENDIDO,
  TEXTO_NAO_E_MAIS_SEU,
  TEXTO_SEM_LEAD_AGUARDANDO,
  TEXTO_SEM_LEITURA,
  dataDaVisita,
  dinheiro,
  textoDaConfirmacao,
  textoDaPergunta,
} from "./textos";

function leitura(parcial: Partial<LeituraDoRetorno>): LeituraDoRetorno {
  return {
    resultado: "atendeu",
    etapa: null,
    visitaEm: null,
    motivoPerda: null,
    resumo: null,
    proximoPasso: null,
    fatos: {},
    ...parcial,
  };
}

describe("textoDaConfirmacao", () => {
  it("atendeu com visita, quartos, orçamento e FGTS", () => {
    expect(
      textoDaConfirmacao({
        nome: "Ana",
        tentativa: 0,
        leitura: leitura({
          etapa: "visita_agendada",
          // sáb 01/11/2025 10h em São Paulo
          visitaEm: "2025-11-01T13:00:00.000Z",
          fatos: { dormitoriosMin: 3, orcamentoMax: 600000, exigenciasEspecificas: ["usa_fgts"] },
        }),
      }),
    ).toBe("✅ Ana · visita agendada sáb 01/11 10h · 3 quartos · até R$ 600 mil · FGTS");
  });

  it("não atendeu: conta a tentativa", () => {
    expect(textoDaConfirmacao({ nome: "Ana", tentativa: 2, leitura: leitura({ resultado: "nao_atendeu" }) })).toBe(
      "📞 Ana · não atendeu (2ª tentativa)",
    );
  });

  it("não atendeu sem aviso para contar: sem número de tentativa", () => {
    expect(textoDaConfirmacao({ nome: "Ana", tentativa: 0, leitura: leitura({ resultado: "nao_atendeu" }) })).toBe(
      "📞 Ana · não atendeu",
    );
  });

  it("número errado", () => {
    expect(textoDaConfirmacao({ nome: "Ana", tentativa: 0, leitura: leitura({ resultado: "numero_errado" }) })).toBe(
      "❌ Ana · número errado",
    );
  });

  it("pediu para ligar depois, com o próximo passo fora (só fatos)", () => {
    expect(
      textoDaConfirmacao({
        nome: "Paulo",
        tentativa: 0,
        leitura: leitura({ resultado: "pediu_retorno", fatos: { formaPagamento: "financiamento" } }),
      }),
    ).toBe("🕐 Paulo · pediu para ligar depois · financiamento");
  });

  it("perdido com o motivo", () => {
    expect(
      textoDaConfirmacao({
        nome: "Ana",
        tentativa: 0,
        leitura: leitura({ etapa: "perdido", motivoPerda: "comprou em outro lugar" }),
      }),
    ).toBe("🚫 Ana · perdido: comprou em outro lugar");
  });

  it("atendeu sem nada novo: só o atendimento", () => {
    expect(textoDaConfirmacao({ nome: "Ana", tentativa: 0, leitura: leitura({}) })).toBe("✅ Ana · atendeu");
  });

  it("visita com minutos, faixa de orçamento, à vista, região e exigência sem tradução", () => {
    expect(
      textoDaConfirmacao({
        nome: "Ana",
        tentativa: 0,
        leitura: leitura({
          visitaEm: "2025-11-01T13:30:00.000Z",
          fatos: {
            dormitoriosMin: 1,
            orcamentoMin: 400000,
            orcamentoMax: 1200000,
            regiaoInteresse: "Centro de Barueri",
            formaPagamento: "a_vista",
            exigenciasEspecificas: ["pet_friendly"],
          },
        }),
      }),
    ).toBe(
      "✅ Ana · visita agendada sáb 01/11 10h30 · 1 quarto · R$ 400 mil a R$ 1,2 milhão · Centro de Barueri · à vista · pet friendly",
    );
  });

  it("nunca mostra palavra técnica", () => {
    const t = textoDaConfirmacao({
      nome: "Ana",
      tentativa: 3,
      leitura: leitura({ resultado: "nao_atendeu" }),
    });
    expect(t).not.toMatch(/instância|fila|cota|JID|lead/i);
  });
});

describe("dinheiro e data", () => {
  it("mil e milhão", () => {
    expect(dinheiro(600000)).toBe("R$ 600 mil");
    expect(dinheiro(650500)).toBe("R$ 650,5 mil");
    expect(dinheiro(1000000)).toBe("R$ 1 milhão");
    expect(dinheiro(1200000)).toBe("R$ 1,2 milhão");
    expect(dinheiro(2500000)).toBe("R$ 2,5 milhões");
    expect(dinheiro(900)).toBe("R$ 900");
  });

  it("data no fuso de São Paulo, mesmo virando o dia em UTC", () => {
    // 01/11/2025 23h em SP = 02/11 02h UTC
    expect(dataDaVisita("2025-11-02T02:00:00.000Z")).toBe("sáb 01/11 23h");
    expect(dataDaVisita("2025-11-03T12:05:00.000Z")).toBe("seg 03/11 9h05");
  });
});

describe("textos fixos", () => {
  it("pergunta", () => {
    expect(textoDaPergunta(["Ana", "Paulo"])).toBe(
      "Esse retorno é sobre: 1) Ana 2) Paulo? Responda em cima desta mensagem com o número.",
    );
  });

  it("áudio não entendido", () => {
    expect(TEXTO_AUDIO_NAO_ENTENDIDO).toBe("Não consegui entender o áudio, pode mandar de novo?");
  });

  it("sem leitura automática", () => {
    expect(TEXTO_SEM_LEITURA("Ana")).toBe("📝 Ana · anotado na ficha, sem leitura automática");
  });

  it("sem cliente aguardando", () => {
    expect(TEXTO_SEM_LEAD_AGUARDANDO).toBe(
      "Não achei cliente aguardando retorno. Responda em cima do aviso do cliente para eu anotar.",
    );
  });

  it("cliente que passou para outro corretor", () => {
    expect(TEXTO_NAO_E_MAIS_SEU("Ana")).toBe("Ana agora está com outro corretor, então não anotei este retorno.");
  });
});

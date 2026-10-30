import { describe, expect, it } from "vitest";
import {
  AJUSTE_MAXIMO_DA_IA,
  calcularNotaDoLead,
  intencaoNasFalas,
  notaDaLinha,
  refinarComAIa,
  rotuloDaNota,
  type SinaisDoLead,
} from "./notaDoLead";

/*
 * A régua da nota do lead (IA no atendimento, 30/10/2026). Os casos são os
 * da carteira de verdade: o lead que marcou visita e responde, o que sumiu,
 * o que só perguntou preço, o encerrado.
 */
const AGORA = new Date("2026-10-30T15:00:00-03:00");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();
const diasDepois = (d: number) => new Date(AGORA.getTime() + d * 86_400_000).toISOString();

const sinais = (extra: Partial<SinaisDoLead> = {}): SinaisDoLead => ({
  etapa: "em_conversa",
  ultimaFalaDoClienteEm: horasAtras(48),
  falasDoClienteEm7Dias: 1,
  visitaAgendadaEm: null,
  orcamentoInformado: false,
  rendaInformada: false,
  intencao: null,
  tentativasSemResposta: 0,
  ...extra,
});

describe("calcularNotaDoLead", () => {
  it("visita marcada, pedido de próximo passo e conversa ativa é quente, com o motivo", () => {
    const nota = calcularNotaDoLead(
      sinais({
        etapa: "visita_agendada",
        visitaAgendadaEm: diasDepois(2),
        intencao: "forte",
        falasDoClienteEm7Dias: 6,
        ultimaFalaDoClienteEm: horasAtras(2),
      }),
      AGORA,
    );
    expect(nota.label).toBe("quente");
    expect(nota.score).toBeGreaterThanOrEqual(70);
    expect(nota.score).toBeLessThanOrEqual(100);
    expect(nota.motivo).toMatch(/Visita marcada para 01\/11|Em atendimento|Pediu o próximo passo/);
    expect(nota.motivo.split(" · ").length).toBeLessThanOrEqual(2);
  });

  it("quem sumiu há mais de duas semanas esfria, e o motivo diz por quê", () => {
    const nota = calcularNotaDoLead(sinais({ ultimaFalaDoClienteEm: horasAtras(24 * 20), tentativasSemResposta: 3 }), AGORA);
    expect(nota.label).toBe("frio");
    expect(nota.motivo).toContain("Sem resposta há 20 dias");
    expect(nota.motivo).toContain("3 tentativas sem retorno");
  });

  it("a mesma conversa esfria com o tempo (o que a varredura do tique aplica)", () => {
    const hoje = calcularNotaDoLead(sinais({ ultimaFalaDoClienteEm: horasAtras(3), intencao: "media" }), AGORA);
    const depois = calcularNotaDoLead(
      sinais({ ultimaFalaDoClienteEm: horasAtras(3), intencao: "media" }),
      new Date(AGORA.getTime() + 16 * 86_400_000),
    );
    expect(depois.score).toBeLessThan(hoje.score);
  });

  it("orçamento e renda informados contam, e a intenção média fica abaixo da forte", () => {
    const base = calcularNotaDoLead(sinais(), AGORA).score;
    expect(calcularNotaDoLead(sinais({ orcamentoInformado: true, rendaInformada: true }), AGORA).score).toBe(base + 10);
    const media = calcularNotaDoLead(sinais({ intencao: "media" }), AGORA).score;
    const forte = calcularNotaDoLead(sinais({ intencao: "forte" }), AGORA).score;
    expect(media).toBeGreaterThan(base);
    expect(forte).toBeGreaterThan(media);
  });

  it("negócio encerrado ou pedido de não contato zera, sem refino da IA", () => {
    expect(calcularNotaDoLead(sinais({ etapa: "perdido" }), AGORA)).toEqual({ score: 0, label: "frio", motivo: "Negócio perdido" });
    expect(calcularNotaDoLead(sinais({ etapa: "fechado" }), AGORA).score).toBe(0);
    const parou = calcularNotaDoLead(sinais({ naoContatar: true, intencao: "forte" }), AGORA);
    expect(parou.motivo).toBe("Pediu para não ser contatado");
    expect(refinarComAIa(parou, "quente").score).toBe(0);
  });

  it("lead novo sem resposta e conversa velha fora da janela", () => {
    expect(calcularNotaDoLead(sinais({ etapa: "novo", ultimaFalaDoClienteEm: null, falasDoClienteEm7Dias: 0 }), AGORA).motivo).toBe(
      "Ainda não respondeu",
    );
    const velha = calcularNotaDoLead(sinais({ ultimaFalaDoClienteEm: null, semFalaHaMaisDeDias: 45, falasDoClienteEm7Dias: 0 }), AGORA);
    expect(velha.label).toBe("frio");
    expect(velha.motivo).toContain("mais de 45 dias");
  });

  it("o motivo usa o compromisso do ramo (consulta, reunião)", () => {
    const nota = calcularNotaDoLead(sinais({ visitaAgendadaEm: diasDepois(1) }), AGORA, { compromisso: "consulta" });
    expect(nota.motivo).toContain("Consulta marcada");
    expect(nota.motivo).not.toMatch(/visita/i);
  });

  it("sempre entre 0 e 100", () => {
    const tudo = calcularNotaDoLead(
      sinais({
        etapa: "documentacao",
        visitaAgendadaEm: diasDepois(1),
        intencao: "forte",
        orcamentoInformado: true,
        rendaInformada: true,
        falasDoClienteEm7Dias: 30,
        ultimaFalaDoClienteEm: horasAtras(1),
      }),
      AGORA,
    );
    expect(tudo.score).toBe(100);
    const nada = calcularNotaDoLead(sinais({ ultimaFalaDoClienteEm: horasAtras(24 * 40), tentativasSemResposta: 9, etapa: "novo" }), AGORA);
    expect(nada.score).toBe(0);
  });
});

describe("intencaoNasFalas", () => {
  it("pedido de próximo passo é forte; preço e condição são média", () => {
    expect(intencaoNasFalas(["Quero marcar uma visita sábado"])).toBe("forte");
    expect(intencaoNasFalas(["pode me ligar depois das 18h?"])).toBe("forte");
    expect(intencaoNasFalas(["qual o valor da parcela?"])).toBe("media");
    expect(intencaoNasFalas(["bom dia"])).toBeNull();
  });

  it("a urgência do dossiê completa o que a expressão não pega", () => {
    expect(intencaoNasFalas(["oi"], "imediata")).toBe("forte");
    expect(intencaoNasFalas(["oi"], "3_meses")).toBe("media");
    expect(intencaoNasFalas(["oi"], "apenas_pesquisando")).toBeNull();
  });
});

describe("refinarComAIa", () => {
  it("puxa no máximo o ajuste permitido, na direção da leitura", () => {
    const morno = { score: 50, label: "morno" as const, motivo: "Em atendimento" };
    const subiu = refinarComAIa(morno, "quente");
    expect(subiu.score).toBe(50 + AJUSTE_MAXIMO_DA_IA);
    expect(subiu.motivo).toBe("Em atendimento");
    expect(refinarComAIa(morno, "frio").score).toBe(50 - AJUSTE_MAXIMO_DA_IA);
    expect(refinarComAIa(morno, null)).toBe(morno);
  });

  it("o rótulo acompanha o número refinado", () => {
    expect(refinarComAIa({ score: 65, label: "morno", motivo: "" }, "quente").label).toBe("quente");
  });
});

describe("rótulo e leitura da linha", () => {
  it("as faixas", () => {
    expect(rotuloDaNota(70)).toBe("quente");
    expect(rotuloDaNota(69)).toBe("morno");
    expect(rotuloDaNota(40)).toBe("morno");
    expect(rotuloDaNota(39)).toBe("frio");
  });

  it("linha sem nota é null; rótulo inválido cai na faixa do número", () => {
    expect(notaDaLinha({})).toBeNull();
    expect(notaDaLinha({ nota_score: null })).toBeNull();
    expect(notaDaLinha({ nota_score: 80, nota_label: "xx", nota_motivo: null })).toEqual({ score: 80, label: "quente", motivo: "" });
  });
});

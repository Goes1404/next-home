import { describe, expect, it } from "vitest";
import {
  bloqueadoAtePor,
  dentroDaJanela,
  deveAbrirDisjuntor,
  diasDesdeConexao,
  limiteDiarioCampanha,
  momentoEmSaoPaulo,
  podeEnviar,
  saldoDiario,
} from "./antiBan";

/** Helper: monta um instante UTC a partir de uma hora de São Paulo (UTC-3). */
function emSaoPaulo(iso: string): Date {
  return new Date(`${iso}-03:00`);
}

describe("Curva de aquecimento", () => {
  it("começa baixo e sobe por faixas", () => {
    expect(limiteDiarioCampanha(0)).toBe(15);
    expect(limiteDiarioCampanha(2)).toBe(15);
    expect(limiteDiarioCampanha(3)).toBe(30);
    expect(limiteDiarioCampanha(7)).toBe(60);
    expect(limiteDiarioCampanha(14)).toBe(100);
    expect(limiteDiarioCampanha(30)).toBe(150);
  });

  it("nunca libera cota para número não conectado", () => {
    expect(limiteDiarioCampanha(-1)).toBe(0);
  });

  it("conta dias inteiros desde a conexão", () => {
    const conectado = new Date("2026-08-01T12:00:00Z");
    expect(diasDesdeConexao(conectado, new Date("2026-08-01T23:00:00Z"))).toBe(0);
    expect(diasDesdeConexao(conectado, new Date("2026-08-05T12:00:00Z"))).toBe(4);
  });
});

describe("Janela de horário (fuso de São Paulo)", () => {
  it("lê a hora no fuso certo, não em UTC", () => {
    // 12:00 UTC = 09:00 em São Paulo.
    expect(momentoEmSaoPaulo(new Date("2026-08-19T12:00:00Z")).hora).toBe(9);
  });

  it("permite horário comercial em dia útil", () => {
    expect(dentroDaJanela(emSaoPaulo("2026-08-19T10:00:00"))).toBe(true);
  });

  it("bloqueia madrugada", () => {
    expect(dentroDaJanela(emSaoPaulo("2026-08-19T03:00:00"))).toBe(false);
  });

  it("bloqueia antes de abrir e depois de fechar", () => {
    expect(dentroDaJanela(emSaoPaulo("2026-08-19T08:00:00"))).toBe(false);
    expect(dentroDaJanela(emSaoPaulo("2026-08-19T21:00:00"))).toBe(false);
  });

  it("aceita até 20h59, o último minuto da janela", () => {
    expect(dentroDaJanela(emSaoPaulo("2026-08-19T20:59:00"))).toBe(true);
  });

  it("bloqueia domingo por padrão", () => {
    // 2026-08-23 é um domingo.
    expect(dentroDaJanela(emSaoPaulo("2026-08-23T10:00:00"))).toBe(false);
  });

  it("permite sábado", () => {
    // 2026-08-22 é um sábado.
    expect(dentroDaJanela(emSaoPaulo("2026-08-22T10:00:00"))).toBe(true);
  });
});

describe("Decisão de envio", () => {
  const conectadoEm = new Date("2026-07-01T12:00:00Z"); // número maduro
  const horarioComercial = emSaoPaulo("2026-08-19T10:00:00");

  it("responder quem escreveu ignora janela e cota", () => {
    // Cliente de madrugada, cota estourada: ainda assim responde. Deixar
    // no vácuo quem puxou conversa é pior para o número do que responder.
    const veredito = podeEnviar({
      tipo: "resposta",
      conectadoEm,
      enviosCampanhaHoje: 9999,
      agora: emSaoPaulo("2026-08-19T03:00:00"),
    });
    expect(veredito.permitido).toBe(true);
  });

  it("libera campanha dentro da janela e da cota", () => {
    const veredito = podeEnviar({
      tipo: "campanha",
      conectadoEm,
      enviosCampanhaHoje: 10,
      agora: horarioComercial,
    });
    expect(veredito.permitido).toBe(true);
  });

  it("barra campanha fora da janela", () => {
    const veredito = podeEnviar({
      tipo: "campanha",
      conectadoEm,
      enviosCampanhaHoje: 0,
      agora: emSaoPaulo("2026-08-19T23:00:00"),
    });
    expect(veredito).toMatchObject({ permitido: false, motivo: "fora_da_janela" });
  });

  it("barra campanha ao atingir a cota do dia", () => {
    const veredito = podeEnviar({
      tipo: "campanha",
      conectadoEm,
      enviosCampanhaHoje: 150,
      agora: horarioComercial,
    });
    expect(veredito).toMatchObject({ permitido: false, motivo: "cota_diaria_atingida" });
  });

  it("aplica cota reduzida em número recém-conectado", () => {
    const recem = new Date(horarioComercial.getTime() - 86_400_000); // 1 dia
    const veredito = podeEnviar({
      tipo: "campanha",
      conectadoEm: recem,
      enviosCampanhaHoje: 15,
      agora: horarioComercial,
    });
    expect(veredito).toMatchObject({ permitido: false, motivo: "cota_diaria_atingida" });
    if (!veredito.permitido) expect(veredito.detalhe).toMatch(/aquecimento/i);
  });

  it("barra qualquer campanha com o disjuntor aberto", () => {
    const veredito = podeEnviar({
      tipo: "campanha",
      conectadoEm,
      enviosCampanhaHoje: 0,
      bloqueadoAte: new Date(horarioComercial.getTime() + 3600_000),
      agora: horarioComercial,
    });
    expect(veredito).toMatchObject({ permitido: false, motivo: "numero_bloqueado" });
  });

  it("volta a permitir depois que o bloqueio expira", () => {
    const veredito = podeEnviar({
      tipo: "campanha",
      conectadoEm,
      enviosCampanhaHoje: 0,
      bloqueadoAte: new Date(horarioComercial.getTime() - 1000),
      agora: horarioComercial,
    });
    expect(veredito.permitido).toBe(true);
  });
});

describe("Saldo do dia", () => {
  it("desconta o que já saiu", () => {
    const conectadoEm = new Date("2026-07-01T12:00:00Z");
    const agora = emSaoPaulo("2026-08-19T10:00:00");
    expect(saldoDiario({ conectadoEm, enviosCampanhaHoje: 20, agora })).toBe(130);
  });

  it("nunca fica negativo", () => {
    const conectadoEm = new Date("2026-07-01T12:00:00Z");
    const agora = emSaoPaulo("2026-08-19T10:00:00");
    expect(saldoDiario({ conectadoEm, enviosCampanhaHoje: 500, agora })).toBe(0);
  });
});

describe("Disjuntor", () => {
  it("abre a partir de três falhas seguidas", () => {
    expect(deveAbrirDisjuntor(2)).toBe(false);
    expect(deveAbrirDisjuntor(3)).toBe(true);
  });

  it("bloqueia por 12 horas", () => {
    const agora = new Date("2026-08-19T10:00:00Z");
    expect(bloqueadoAtePor(agora).toISOString()).toBe("2026-08-19T22:00:00.000Z");
  });
});

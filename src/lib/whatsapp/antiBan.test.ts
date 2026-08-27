import { describe, expect, it } from "vitest";
import {
  bloqueadoAtePor,
  dentroDaJanela,
  deveAbrirDisjuntor,
  diasDesdeConexao,
  ehDestinatarioInexistente,
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

describe("Destinatário sem WhatsApp não é falha do nosso número", () => {
  // O caso real: 57 itens travados na fila porque três leads seguidos
  // tinham telefone digitado errado no cadastro. O disjuntor abriu por 12h
  // achando que a conexão estava doente.
  const respostaReal =
    'HTTP 400: {"status":400,"error":"Bad Request","response":{"message":[{"jid":"5581914849876@s.whatsapp.net","exists":false,"number":"5581914849876"}]}}';

  it("reconhece a resposta da Evolution para número inexistente", () => {
    expect(ehDestinatarioInexistente(respostaReal)).toBe(true);
  });

  it("falha de verdade do provedor continua contando", () => {
    expect(ehDestinatarioInexistente("HTTP 500: Internal Server Error")).toBe(false);
    expect(ehDestinatarioInexistente("HTTP 401: unauthorized")).toBe(false);
    expect(ehDestinatarioInexistente(undefined)).toBe(false);
  });

  it("número que EXISTE não é confundido com inexistente", () => {
    expect(ehDestinatarioInexistente('{"exists":true,"number":"5511999998888"}')).toBe(false);
  });

  it("três números inexistentes não abririam o disjuntor", () => {
    // A prova da regra: só falha real alimenta o contador.
    const falhasReais = [respostaReal, respostaReal, respostaReal].filter(
      (d) => !ehDestinatarioInexistente(d),
    ).length;
    expect(deveAbrirDisjuntor(falhasReais)).toBe(false);
  });
});

describe("Exceção de janela — o botão 'enviar a qualquer hora' (0058)", () => {
  const conectadoEm = new Date("2026-07-01T12:00:00Z"); // número maduro
  const madrugada = emSaoPaulo("2026-08-19T03:00:00");
  const domingo = emSaoPaulo("2026-08-23T10:00:00");

  it("libera campanha de madrugada quando a exceção está marcada", () => {
    expect(
      podeEnviar({
        tipo: "campanha",
        conectadoEm,
        enviosCampanhaHoje: 0,
        ignorarJanela: true,
        agora: madrugada,
      }).permitido,
    ).toBe(true);
  });

  it("libera também no domingo", () => {
    expect(
      podeEnviar({
        tipo: "campanha",
        conectadoEm,
        enviosCampanhaHoje: 0,
        ignorarJanela: true,
        agora: domingo,
      }).permitido,
    ).toBe(true);
  });

  /*
   * O ponto da exceção: ela afrouxa a JANELA e nada mais. Cota, aquecimento
   * e disjuntor são o que protege o número — a janela protege a reputação
   * junto a quem recebe. Se um dia isso passar a liberar os quatro, o botão
   * deixa de ser exceção e vira um jeito de queimar a linha.
   */
  it("NÃO afrouxa a cota diária", () => {
    expect(
      podeEnviar({
        tipo: "campanha",
        conectadoEm,
        enviosCampanhaHoje: 9999,
        ignorarJanela: true,
        agora: madrugada,
      }),
    ).toMatchObject({ permitido: false, motivo: "cota_diaria_atingida" });
  });

  it("NÃO afrouxa a curva de aquecimento", () => {
    // Número conectado há 1 dia: teto de 15, já gastos.
    expect(
      podeEnviar({
        tipo: "campanha",
        conectadoEm: new Date(madrugada.getTime() - 86_400_000),
        enviosCampanhaHoje: 15,
        ignorarJanela: true,
        agora: madrugada,
      }),
    ).toMatchObject({ permitido: false, motivo: "cota_diaria_atingida" });
  });

  it("NÃO afrouxa o disjuntor de falhas seguidas", () => {
    expect(
      podeEnviar({
        tipo: "campanha",
        conectadoEm,
        enviosCampanhaHoje: 0,
        ignorarJanela: true,
        bloqueadoAte: new Date(madrugada.getTime() + 3600_000),
        agora: madrugada,
      }),
    ).toMatchObject({ permitido: false, motivo: "numero_bloqueado" });
  });

  it("sem a marca, madrugada continua barrada", () => {
    expect(
      podeEnviar({
        tipo: "campanha",
        conectadoEm,
        enviosCampanhaHoje: 0,
        agora: madrugada,
      }),
    ).toMatchObject({ permitido: false, motivo: "fora_da_janela" });
  });
});

describe("Fila com a exceção de janela", () => {
  const leads = Array.from({ length: 8 }, (_, i) => ({
    id: `l${i}`,
    nome: `Lead ${i}`,
    telefone: `5511900000${i}0`,
  }));

  it("agenda a partir de agora, sem empurrar para o horário comercial", async () => {
    const { montarFilaCampanha } = await import("./campaignQueue");
    const fila = montarFilaCampanha({
      campanhaId: "c1",
      leads,
      mensagemBase: "Olá {nome}",
      ignorarJanela: true,
    });

    // O primeiro item sai em menos de dois minutos, seja qual for a hora
    // em que o teste rodar. Sem a exceção, rodando de madrugada, ele seria
    // empurrado para as 9h — horas de distância.
    const esperaMs = new Date(fila[0].agendadoPara).getTime() - Date.now();
    expect(esperaMs).toBeLessThan(2 * 60_000);
  });

  it("mantém o espaçamento anti-ban entre os itens", async () => {
    const { montarFilaCampanha, INTERVALO_MINIMO_SEGUNDOS } = await import("./campaignQueue");
    const fila = montarFilaCampanha({
      campanhaId: "c2",
      leads,
      mensagemBase: "Olá {nome}",
      ignorarJanela: true,
    });

    // A janela some; a rajada não pode aparecer no lugar dela.
    for (let i = 1; i < fila.length; i++) {
      const delta =
        new Date(fila[i].agendadoPara).getTime() - new Date(fila[i - 1].agendadoPara).getTime();
      expect(delta).toBeGreaterThanOrEqual(INTERVALO_MINIMO_SEGUNDOS * 1000);
    }
  });
});

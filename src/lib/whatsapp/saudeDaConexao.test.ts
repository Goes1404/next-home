import { describe, expect, it } from "vitest";
import { avaliarSaudeDaConexao, quandoEmSaoPaulo, type FotoDaConexao } from "./saudeDaConexao";

/** 31/08/2026, 06h30 em São Paulo (09h30 UTC). */
const AGORA = new Date("2026-08-31T09:30:00Z");

const NO_AR: FotoDaConexao = {
  statusConexao: "conectado",
  conectadoEm: new Date("2026-08-01T12:00:00Z"),
  desconectadoEm: null,
  bloqueadoAte: null,
  enviosCampanhaData: null,
  enviosCampanhaContador: 0,
  pendentes: 0,
};

describe("avaliarSaudeDaConexao", () => {
  it("não avisa nada quando está tudo certo", () => {
    expect(avaliarSaudeDaConexao(NO_AR, AGORA)).toBeNull();
  });

  /*
   * O incidente que originou este módulo, reconstruído: a instância caiu em
   * 28/08 às 16h23 (19h23 UTC) e ninguém soube por três dias.
   */
  it("reconhece a queda e diz há quanto tempo e o que parou", () => {
    const aviso = avaliarSaudeDaConexao(
      {
        ...NO_AR,
        statusConexao: "desconectado",
        desconectadoEm: new Date("2026-08-28T19:23:00Z"),
        pendentes: 15,
      },
      AGORA,
    );

    expect(aviso?.tipo).toBe("caiu");
    expect(aviso?.gravidade).toBe("perigo");
    expect(aviso?.mereceEmail).toBe(true);
    expect(aviso?.detalhe).toContain("28/08 às 16h23");
    expect(aviso?.detalhe).toContain("faz 2 dias");
    expect(aviso?.detalhe).toContain("15 mensagens");
  });

  /*
   * Queda de minutos costuma ser oscilação de internet e se resolve sozinha.
   * Dizer "faz 4 minutos" transforma ruído em alarme — e alarme que toca à
   * toa deixa de ser lido, que é o pior desfecho para um aviso.
   */
  it("não dramatiza queda recente: avisa, mas sem contar o tempo", () => {
    const aviso = avaliarSaudeDaConexao(
      {
        ...NO_AR,
        statusConexao: "desconectado",
        desconectadoEm: new Date("2026-08-31T09:10:00Z"), // 20 minutos atrás
      },
      AGORA,
    );

    expect(aviso?.tipo).toBe("caiu");
    expect(aviso?.detalhe).not.toContain("faz");
  });

  it("quem nunca pareou recebe outro texto, e não recebe e-mail", () => {
    const aviso = avaliarSaudeDaConexao(
      { ...NO_AR, statusConexao: "desconectado", conectadoEm: null },
      AGORA,
    );

    expect(aviso?.titulo).toContain("ainda não está conectado");
    expect(aviso?.acao).toBe("Conectar meu número");
    // Não houve queda: o corretor sabe que nunca conectou. E-mail aqui seria spam.
    expect(aviso?.mereceEmail).toBe(false);
  });

  /*
   * A ordem da régua: um número caído COM disjuntor aberto é, antes de tudo,
   * um número caído. Avisar "os envios estão pausados" a quem está fora do ar
   * manda a pessoa esperar por algo que não vai acontecer.
   */
  it("queda vence disjuntor quando os dois valem ao mesmo tempo", () => {
    const aviso = avaliarSaudeDaConexao(
      {
        ...NO_AR,
        statusConexao: "desconectado",
        desconectadoEm: new Date("2026-08-28T19:23:00Z"),
        bloqueadoAte: new Date("2026-08-31T20:00:00Z"),
      },
      AGORA,
    );

    expect(aviso?.tipo).toBe("caiu");
  });

  it("disjuntor aberto vira aviso âmbar que não manda e-mail", () => {
    const aviso = avaliarSaudeDaConexao(
      { ...NO_AR, bloqueadoAte: new Date("2026-08-31T16:00:00Z") },
      AGORA,
    );

    expect(aviso?.tipo).toBe("envios_pausados");
    expect(aviso?.gravidade).toBe("alerta");
    // Volta sozinho: e-mail sobre algo que se resolve em horas é ruído.
    expect(aviso?.mereceEmail).toBe(false);
    expect(aviso?.detalhe).toContain("13h00"); // 16h UTC = 13h em São Paulo
  });

  it("disjuntor já vencido não avisa mais nada", () => {
    expect(
      avaliarSaudeDaConexao(
        { ...NO_AR, bloqueadoAte: new Date("2026-08-29T07:23:00Z") },
        AGORA,
      ),
    ).toBeNull();
  });

  describe("cota do dia esgotada", () => {
    // Conectado em 01/08: mais de 21 dias de aquecimento, cota no teto.
    const cheio = {
      ...NO_AR,
      pendentes: 15,
      enviosCampanhaData: "2026-08-31",
      enviosCampanhaContador: 400,
    };

    it("explica a espera quando a cota acabou e há fila", () => {
      const aviso = avaliarSaudeDaConexao(cheio, AGORA);
      expect(aviso?.tipo).toBe("fila_esperando");
      expect(aviso?.gravidade).toBe("info");
      expect(aviso?.titulo).toContain("15 mensagens");
    });

    it("não avisa quando ainda há cota de sobra", () => {
      expect(avaliarSaudeDaConexao({ ...cheio, enviosCampanhaContador: 1 }, AGORA)).toBeNull();
    });

    /*
     * O contador é do DIA, e a coluna guarda a data dele. Sem conferir a
     * data, o contador de ontem faria a fila parecer travada logo de manhã,
     * quando na verdade ela tem o dia inteiro pela frente.
     */
    it("ignora contador de outro dia", () => {
      expect(
        avaliarSaudeDaConexao({ ...cheio, enviosCampanhaData: "2026-08-30" }, AGORA),
      ).toBeNull();
    });

    it("sem fila não há o que explicar", () => {
      expect(avaliarSaudeDaConexao({ ...cheio, pendentes: 0 }, AGORA)).toBeNull();
    });
  });

  it("escreve uma mensagem no singular", () => {
    const aviso = avaliarSaudeDaConexao(
      {
        ...NO_AR,
        statusConexao: "desconectado",
        desconectadoEm: new Date("2026-08-28T19:23:00Z"),
        pendentes: 1,
      },
      AGORA,
    );
    expect(aviso?.detalhe).toContain("1 mensagem está parada");
  });
});

describe("quandoEmSaoPaulo", () => {
  /*
   * A armadilha do calendário desta base: formatar o rótulo num fuso e a
   * data noutro já ensinou ao modelo que sábado tem a data de domingo.
   * Aqui o horário UTC cruza a meia-noite de Brasília ao contrário.
   */
  it("formata no fuso de São Paulo, não em UTC", () => {
    expect(quandoEmSaoPaulo(new Date("2026-08-29T02:00:00Z"))).toBe("28/08 às 23h00");
  });
});

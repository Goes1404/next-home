import { describe, expect, it } from "vitest";
import {
  blocoDeHorarios,
  proximosHorarios,
  GRADE_PADRAO,
  gradeEfetiva,
  type FaixaDisponivel,
} from "./agendaDeVisitas";

/** Sábado, 05/09/2026, 08h em São Paulo (11h UTC). */
const SABADO_8H = new Date("2026-09-05T11:00:00Z");

/** Sábado das 9h às 12h; terça das 14h às 16h. */
const GRADE: FaixaDisponivel[] = [
  { diaSemana: 6, horaInicio: 9, horaFim: 12 },
  { diaSemana: 2, horaInicio: 14, horaFim: 16 },
];

describe("proximosHorarios", () => {
  it("sem grade não oferece nada — melhor calar que prometer", () => {
    expect(proximosHorarios({ grade: [], ocupados: [], agora: SABADO_8H })).toEqual([]);
  });

  it("oferece só os dias da grade, em ordem", () => {
    const h = proximosHorarios({ grade: GRADE, ocupados: [], agora: SABADO_8H, quantos: 5 });
    expect(h.map((x) => x.rotulo)).toEqual([
      "sábado, 05/09 às 11h", // 8h + 3h de antecedência: 9h e 10h ficam de fora
      "terça-feira, 08/09 às 14h",
      "terça-feira, 08/09 às 15h",
      "sábado, 12/09 às 9h",
      "sábado, 12/09 às 10h",
    ]);
  });

  /*
   * Antecedência: ninguém marca visita para daqui a dez minutos, e oferecer
   * isso faz o cliente aceitar algo que o corretor não vai conseguir honrar.
   */
  it("respeita a antecedência mínima de 3 horas", () => {
    const h = proximosHorarios({ grade: GRADE, ocupados: [], agora: SABADO_8H, quantos: 1 });
    expect(h[0].rotulo).toBe("sábado, 05/09 às 11h");
  });

  it("pula horário já tomado por outra visita", () => {
    const h = proximosHorarios({
      grade: GRADE,
      ocupados: [new Date("2026-09-05T14:00:00Z")], // sábado 11h em SP
      agora: SABADO_8H,
      quantos: 1,
    });
    expect(h[0].rotulo).toBe("terça-feira, 08/09 às 14h");
  });

  it("pula horário que cruza a hora de uma visita marcada fora da hora cheia (trava de 60 min da 0222)", () => {
    const h = proximosHorarios({
      grade: GRADE,
      ocupados: [new Date("2026-09-05T13:30:00Z")], // sábado 10h30 em SP: ocupa até 11h30
      agora: SABADO_8H,
      quantos: 1,
    });
    expect(h[0].rotulo).toBe("terça-feira, 08/09 às 14h");
  });

  it("visita que termina na hora cheia não tira a vaga seguinte", () => {
    const h = proximosHorarios({
      grade: GRADE,
      ocupados: [new Date("2026-09-05T13:00:00Z")], // sábado 10h em SP: termina às 11h
      agora: SABADO_8H,
      quantos: 1,
    });
    expect(h[0].rotulo).toBe("sábado, 05/09 às 11h");
  });

  /*
   * Reunião e bloqueio (0224) têm a duração deles: a IA não oferece vaga que
   * cruze o compromisso, e a que começa no fim dele fica livre — a mesma
   * conta da trava do banco.
   */
  it("pula horário que cruza reunião ou bloqueio e oferece o que começa no fim dele", () => {
    const h = proximosHorarios({
      grade: GRADE,
      ocupados: [],
      bloqueios: [
        // terça 08/09 das 13h30 às 15h em SP: tira as 14h, deixa as 15h
        { inicio: new Date("2026-09-08T16:30:00Z"), fim: new Date("2026-09-08T18:00:00Z") },
        // sábado 05/09 das 10h às 12h em SP: tira as 11h
        { inicio: new Date("2026-09-05T13:00:00Z"), fim: new Date("2026-09-05T15:00:00Z") },
      ],
      agora: SABADO_8H,
      quantos: 2,
    });
    expect(h.map((x) => x.rotulo)).toEqual(["terça-feira, 08/09 às 15h", "sábado, 12/09 às 9h"]);
  });

  it("o instante gravado é o horário local certo", () => {
    const [primeiro] = proximosHorarios({
      grade: GRADE,
      ocupados: [],
      agora: SABADO_8H,
      quantos: 1,
    });
    // 11h em São Paulo = 14h UTC.
    expect(primeiro.quando.toISOString()).toBe("2026-09-05T14:00:00.000Z");
  });

  /*
   * A armadilha do calendário desta base, agora do lado da agenda: às 22h
   * de Brasília já é o dia seguinte em UTC. Se o dia da semana saísse do
   * fuso do servidor, a grade de sábado seria aplicada ao domingo.
   */
  it("lê o dia da semana em São Paulo, não em UTC", () => {
    // Sexta, 04/09/2026, 22h em SP = sábado 01h UTC.
    const sextaTarde = new Date("2026-09-05T01:00:00Z");
    const h = proximosHorarios({ grade: GRADE, ocupados: [], agora: sextaTarde, quantos: 1 });
    // O primeiro sábado ainda é o dia 05, não o 12: para São Paulo ainda é sexta.
    expect(h[0].rotulo).toBe("sábado, 05/09 às 9h");
  });

  it("não passa do horizonte de duas semanas", () => {
    const soDomingo: FaixaDisponivel[] = [{ diaSemana: 0, horaInicio: 9, horaFim: 10 }];
    const h = proximosHorarios({ grade: soDomingo, ocupados: [], agora: SABADO_8H, quantos: 10 });
    // A partir de sábado 05/09, o horizonte alcança até 19/09: sobram os
    // domingos 06 e 13. O de 20/09 fica de fora, que é o ponto.
    expect(h.map((x) => x.rotulo)).toEqual([
      "domingo, 06/09 às 9h",
      "domingo, 13/09 às 9h",
    ]);
  });

  it("agenda cheia devolve lista vazia, sem inventar", () => {
    /*
     * Os ocupados são enumerados da GRADE, não pedidos à própria função:
     * desde que ela passou a amostrar dois por dia, usá-la para montar o
     * fixture deixaria de cobrir tudo — e o teste passaria a afirmar outra
     * coisa sem ninguém perceber.
     */
    const ocupados: Date[] = [];
    for (let i = 0; i <= 14; i++) {
      const dia = new Date(SABADO_8H);
      dia.setUTCDate(dia.getUTCDate() + i);
      const yyyymmdd = dia.toISOString().slice(0, 10);
      const faixa = GRADE.find(
        (f) => f.diaSemana === new Date(`${yyyymmdd}T12:00:00Z`).getUTCDay(),
      );
      if (!faixa) continue;
      for (let hora = faixa.horaInicio; hora < faixa.horaFim; hora++) {
        ocupados.push(new Date(`${yyyymmdd}T${String(hora).padStart(2, "0")}:00:00-03:00`));
      }
    }

    expect(proximosHorarios({ grade: GRADE, ocupados, agora: SABADO_8H })).toEqual([]);
  });
});

/**
 * O defeito medido em 10/09/2026, na conversa 2cff42f6.
 *
 * A grade real da corretora é 9h-22h TODOS OS DIAS. Como a lista pegava os
 * seis primeiros horários em ordem cronológica, ela não chegava nem ao fim
 * do primeiro dia — e o prompt afirmava "só estes existem, é proibido
 * inventar outro". O cliente pediu "amanhã", depois "segunda", e nenhum dos
 * dois estava na lista: a IA teve de escolher entre desobedecer o bloco e
 * recusar o cliente. Fez as duas coisas em turnos diferentes.
 */
describe("a lista cobre DIAS, não horas do mesmo dia", () => {
  const TODOS_OS_DIAS: FaixaDisponivel[] = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    horaInicio: 9,
    horaFim: 22,
  }));

  /** Quinta, 10/09/2026, 01h21 em São Paulo — o instante da conversa real. */
  const QUINTA_1H21 = new Date("2026-09-10T04:21:00Z");

  it("com grade larga, alcança a semana inteira em vez de seis horas do mesmo dia", () => {
    const h = proximosHorarios({ grade: TODOS_OS_DIAS, ocupados: [], agora: QUINTA_1H21 });
    const dias = new Set(h.map((x) => x.rotulo.split(" às ")[0]));

    expect(dias.size).toBeGreaterThanOrEqual(5);
  });

  it("o dia que o cliente pediu existe na lista — era o que faltava", () => {
    const h = proximosHorarios({ grade: TODOS_OS_DIAS, ocupados: [], agora: QUINTA_1H21 });

    // Ele disse "amanhã" (sexta) e depois "pode ser segunda?".
    expect(h.some((x) => x.rotulo.startsWith("sexta-feira, 11/09"))).toBe(true);
    expect(h.some((x) => x.rotulo.startsWith("segunda-feira, 14/09"))).toBe(true);
  });

  it("no máximo dois por dia, e separados — manhã e tarde, não duas horas seguidas", () => {
    const h = proximosHorarios({ grade: TODOS_OS_DIAS, ocupados: [], agora: QUINTA_1H21 });
    const doDia = h.filter((x) => x.rotulo.startsWith("sexta-feira, 11/09"));

    expect(doDia).toHaveLength(2);
    expect(doDia[0].rotulo).toBe("sexta-feira, 11/09 às 9h");
    // (9 + 22) / 2 = 15,5 -> 15h. Duas horas seguidas não dão escolha nenhuma.
    expect(doDia[1].rotulo).toBe("sexta-feira, 11/09 às 15h");
  });

  it("o bloco agrupa por dia — lista corrida de quatorze linhas ninguém lê", () => {
    const h = proximosHorarios({ grade: TODOS_OS_DIAS, ocupados: [], agora: QUINTA_1H21 });
    const bloco = blocoDeHorarios(h);

    expect(bloco).toMatch(/sexta-feira, 11\/09: 9h, 15h/);
  });
});

describe("blocoDeHorarios", () => {
  it("sem horário nenhum não escreve bloco — o prompt segue como antes", () => {
    expect(blocoDeHorarios([])).toBe("");
  });

  it("proíbe inventar e manda trocar de par quando ele recusa", () => {
    const texto = blocoDeHorarios(
      proximosHorarios({ grade: GRADE, ocupados: [], agora: SABADO_8H, quantos: 3 }),
    );
    expect(texto).toContain("só estes existem");
    expect(texto).toContain("proibido inventar");
    expect(texto).toContain("DOIS SEGUINTES");
    // Agrupado por dia: "- sábado, 05/09: 11h", não uma linha por horário.
    expect(texto).toContain("sábado, 05/09: 11h");
  });
});

describe("agenda padrão (16/10/2026)", () => {
  it("quem não preencheu a agenda tem todos os dias abertos, das 9h às 20h", () => {
    expect(gradeEfetiva([])).toBe(GRADE_PADRAO);
    expect(GRADE_PADRAO.map((f) => f.diaSemana).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(GRADE_PADRAO.every((f) => f.horaInicio === 9 && f.horaFim === 20)).toBe(true);
  });

  it("a agenda preenchida vale no lugar da padrão", () => {
    expect(gradeEfetiva(GRADE)).toBe(GRADE);
  });

  it("com a padrão a IA tem horário para oferecer, inclusive no domingo", () => {
    const h = proximosHorarios({ grade: gradeEfetiva([]), ocupados: [], agora: SABADO_8H });
    expect(h.length).toBeGreaterThan(0);
    expect(h.some((x) => x.rotulo.startsWith("domingo"))).toBe(true);
    expect(h.every((x) => {
      const hora = Number(x.rotulo.split(" às ")[1].replace("h", ""));
      return hora >= 9 && hora < 20;
    })).toBe(true);
  });
});

describe("horas preferidas do corretor (0154)", () => {
  /** Quarta, 30/09/2026, 10h em São Paulo. */
  const QUARTA_10H = new Date("2026-09-30T13:00:00Z");
  /** A grade real da Bruna: todo dia das 9h às 22h, sábado com 10h e 14h primeiro. */
  const TODO_DIA: FaixaDisponivel[] = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    diaSemana: d,
    horaInicio: 9,
    horaFim: 22,
    ...(d === 6 ? { horasPreferidas: [10, 14] } : {}),
  }));

  it("o sábado preferido entra mesmo além dos seis primeiros horários", () => {
    const h = proximosHorarios({ grade: TODO_DIA, ocupados: [], agora: QUARTA_10H, quantos: 6 });
    const sabado = h.filter((x) => x.preferido).map((x) => x.rotulo);
    expect(sabado).toEqual(["sábado, 03/10 às 10h", "sábado, 03/10 às 14h"]);
  });

  it("o bloco do prompt manda oferecer o preferido primeiro", () => {
    const h = proximosHorarios({ grade: TODO_DIA, ocupados: [], agora: QUARTA_10H, quantos: 6 });
    const bloco = blocoDeHorarios(h);
    expect(bloco).toContain("OFEREÇA PRIMEIRO, como o corretor pediu: sábado, 03/10 às 10h ou às 14h");
  });

  it("hora preferida já ocupada não é oferecida", () => {
    const ocupado = new Date("2026-10-03T13:00:00Z"); // sábado 10h
    const h = proximosHorarios({ grade: TODO_DIA, ocupados: [ocupado], agora: QUARTA_10H, quantos: 6 });
    expect(h.filter((x) => x.preferido).map((x) => x.rotulo)).toEqual(["sábado, 03/10 às 14h"]);
  });

  it("sem preferência, nada muda", () => {
    const h = proximosHorarios({ grade: GRADE, ocupados: [], agora: SABADO_8H, quantos: 5 });
    expect(h.some((x) => x.preferido)).toBe(false);
    expect(blocoDeHorarios(h)).not.toContain("OFEREÇA PRIMEIRO");
  });
});

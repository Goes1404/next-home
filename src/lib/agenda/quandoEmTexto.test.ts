import { describe, expect, it } from "vitest";
import { lerQuando, rotuloDoInstante, rotuloDoIntervalo, diaInteiro } from "./quandoEmTexto";

// Sexta, 30/10/2026, 12h em São Paulo (15h UTC): o servidor roda em UTC.
const AGORA = new Date("2026-10-30T15:00:00Z");

const instante = (texto: string) => {
  const q = lerQuando(texto, AGORA);
  return q.tipo === "instante" ? { inicio: q.inicio.toISOString(), fim: q.fim?.toISOString() ?? null } : q;
};

describe("dia e hora em português viram instante de São Paulo", () => {
  it.each([
    ["amanhã 10h", "2026-10-31T13:00:00.000Z"],
    ["sábado às 10", "2026-10-31T13:00:00.000Z"],
    ["segunda-feira 9h", "2026-11-02T12:00:00.000Z"],
    ["meio-dia de segunda", "2026-11-02T15:00:00.000Z"],
    ["sábado 3 da tarde", "2026-10-31T18:00:00.000Z"],
    ["05/11 às 14h30", "2026-11-05T17:30:00.000Z"],
    ["5/11 14:30", "2026-11-05T17:30:00.000Z"],
    ["dia 5 às 10h", "2026-11-05T13:00:00.000Z"],
    ["5 de dezembro às 9", "2026-12-05T12:00:00.000Z"],
    ["05/01 10h", "2027-01-05T13:00:00.000Z"],
    ["depois de amanhã 8h", "2026-11-01T11:00:00.000Z"],
    ["2026-11-07T10:00:00-03:00", "2026-11-07T13:00:00.000Z"],
    ["2026-11-07T10:00", "2026-11-07T13:00:00.000Z"],
  ])("%s", (texto, esperado) => {
    expect(instante(texto)).toEqual({ inicio: esperado, fim: null });
  });

  it('"último domingo do mês" é o do mês que vem quando o deste já passou (a régua da conversa da Rute)', () => {
    expect(instante("último domingo do mês 10h")).toEqual({ inicio: "2026-11-29T13:00:00.000Z", fim: null });
  });

  it("dia da semana é a PRÓXIMA ocorrência: hoje só se o horário ainda não passou", () => {
    expect(instante("sexta 15h")).toEqual({ inicio: "2026-10-30T18:00:00.000Z", fim: null });
    expect(instante("sexta 10h")).toEqual({ inicio: "2026-11-06T13:00:00.000Z", fim: null });
  });

  it("passado volta como instante (quem chama recusa com a data na mão)", () => {
    expect(instante("hoje 9h")).toEqual({ inicio: "2026-10-30T12:00:00.000Z", fim: null });
    expect(instante("20/10 10h")).toEqual({ inicio: "2026-10-20T13:00:00.000Z", fim: null });
  });

  it("intervalo: das 14h às 16h, das 2 às 4 da tarde, agora até as 16h", () => {
    expect(instante("sexta das 14h às 16h")).toEqual({ inicio: "2026-10-30T17:00:00.000Z", fim: "2026-10-30T19:00:00.000Z" });
    expect(instante("amanhã das 2 às 4 da tarde")).toEqual({ inicio: "2026-10-31T17:00:00.000Z", fim: "2026-10-31T19:00:00.000Z" });
    expect(instante("segunda 14h-16h")).toEqual({ inicio: "2026-11-02T17:00:00.000Z", fim: "2026-11-02T19:00:00.000Z" });
    expect(instante("agora até as 16h")).toEqual({ inicio: "2026-10-30T15:00:00.000Z", fim: "2026-10-30T19:00:00.000Z" });
  });
});

describe("o que falta não é inventado", () => {
  it('"sexta à tarde" é período, sem hora', () => {
    const q = lerQuando("sexta à tarde", AGORA);
    expect(q).toMatchObject({ tipo: "periodo", dia: "2026-10-30", periodo: "tarde" });
    expect(q.tipo === "periodo" && rotuloDoIntervalo(q.inicio, q.fim)).toBe("sexta 30/10 das 13h às 18h");
    expect(lerQuando("minha tarde de segunda", AGORA)).toMatchObject({ tipo: "periodo", dia: "2026-11-02" });
    expect(lerQuando("amanhã de manhã", AGORA)).toMatchObject({ tipo: "periodo", dia: "2026-10-31", periodo: "manha" });
  });

  it("só o dia, só a hora, hora ambígua, data que não existe, nada", () => {
    expect(lerQuando("amanhã", AGORA)).toEqual({ tipo: "so_dia", dia: "2026-10-31" });
    expect(lerQuando("às 10h", AGORA)).toEqual({ tipo: "sem_dia" });
    expect(lerQuando("sábado às 3", AGORA)).toEqual({ tipo: "hora_ambigua", dia: "2026-10-31", hora: 3 });
    expect(lerQuando("31/02 10h", AGORA)).toEqual({ tipo: "nao_entendi" });
    expect(lerQuando("quando der", AGORA)).toEqual({ tipo: "nao_entendi" });
    // Número solto não é hora: "2 quartos" não marca nada às 2h.
    expect(lerQuando("sábado, 2 quartos", AGORA)).toEqual({ tipo: "so_dia", dia: "2026-10-31" });
  });
});

describe("rótulos do resumo", () => {
  it("dia da semana por extenso, data e hora de São Paulo", () => {
    expect(rotuloDoInstante(new Date("2026-10-31T13:00:00Z"))).toBe("sábado 31/10 às 10h");
    expect(rotuloDoInstante(new Date("2026-11-05T17:30:00Z"))).toBe("quinta 05/11 às 14h30");
    // 23h de sexta em SP já é sábado em UTC.
    expect(rotuloDoInstante(new Date("2026-10-31T02:00:00Z"))).toBe("sexta 30/10 às 23h");
  });

  it("o dia todo e o intervalo que vira o dia", () => {
    const { inicio, fim } = diaInteiro("2026-11-06");
    expect(rotuloDoIntervalo(inicio, fim)).toBe("sexta 06/11, o dia todo");
    expect(rotuloDoIntervalo(new Date("2026-11-06T22:00:00Z"), new Date("2026-11-07T12:00:00Z"))).toBe(
      "de sexta 06/11 às 19h até sábado 07/11 às 9h",
    );
  });
});

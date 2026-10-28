import { describe, expect, it } from "vitest";
import type { ItemDaAgenda } from "./itens";
import { deOutrosDias, diaVizinho, passoDoDeslize, posicaoDoAgora, resumoDoDia, rotuloDoDia, semanaDoDia } from "./semana";

/*
 * A faixa da semana e o título do dia da Agenda (visual de 28/10/2026): a
 * semana vai de domingo a sábado e atravessa o mês sem quebrar; o título diz
 * "Hoje"/"Amanhã"/"Ontem" quando cabe; o resumo conta por tipo.
 */
describe("semanaDoDia", () => {
  it("domingo a sábado da semana do dia", () => {
    expect(semanaDoDia("2026-10-28")).toEqual([
      "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31",
    ]);
  });

  it("atravessa a virada do mês", () => {
    expect(semanaDoDia("2026-10-01")[0]).toBe("2026-09-27");
    expect(semanaDoDia("2026-10-01")[6]).toBe("2026-10-03");
  });

  it("o domingo é o primeiro da própria semana", () => {
    expect(semanaDoDia("2026-11-01")[0]).toBe("2026-11-01");
  });
});

describe("diaVizinho", () => {
  it("anda semanas inteiras, virando o mês e o ano", () => {
    expect(diaVizinho("2026-10-28", 7)).toBe("2026-11-04");
    expect(diaVizinho("2026-12-30", 7)).toBe("2027-01-06");
    expect(diaVizinho("2026-10-28", -7)).toBe("2026-10-21");
  });
});

describe("rotuloDoDia", () => {
  it("hoje, amanhã e ontem pelo nome", () => {
    expect(rotuloDoDia("2026-10-28", "2026-10-28")).toBe("Hoje, quarta 28");
    expect(rotuloDoDia("2026-10-29", "2026-10-28")).toBe("Amanhã, quinta 29");
    expect(rotuloDoDia("2026-10-27", "2026-10-28")).toBe("Ontem, terça 27");
  });

  it("outro dia com o mês por extenso", () => {
    expect(rotuloDoDia("2026-10-30", "2026-10-28")).toBe("Sexta, 30 de outubro");
  });
});

const visita = (inicio: string): ItemDaAgenda => ({
  tipo: "visita", id: inicio, inicio, leadId: "l", nome: "Ana", telefone: null, imovel: null, confirmadaPeloCliente: false,
});
const reuniao: ItemDaAgenda = {
  tipo: "compromisso", id: "r", inicio: "2026-10-28T19:00:00Z", fim: "2026-10-28T20:00:00Z", subtipo: "reuniao", titulo: "", podeCancelar: false,
};
const bloqueio: ItemDaAgenda = { ...reuniao, id: "b", subtipo: "bloqueio" } as ItemDaAgenda;
const tarefa: ItemDaAgenda = { tipo: "tarefa", id: "t", inicio: "2026-10-28T15:00:00Z", titulo: "x", leadId: null, nome: null };
const lembrete: ItemDaAgenda = { tipo: "lembrete", id: "m", inicio: "2026-10-28T21:00:00Z", texto: "x", leadId: null };

describe("resumoDoDia", () => {
  it("conta por tipo, no plural certo", () => {
    expect(resumoDoDia([visita("2026-10-28T13:00:00Z"), visita("2026-10-28T17:30:00Z"), tarefa, reuniao, lembrete])).toBe(
      "2 visitas · 1 tarefa · 1 reunião · 1 lembrete",
    );
  });

  it("bloqueio conta à parte da reunião", () => {
    expect(resumoDoDia([bloqueio])).toBe("1 horário bloqueado");
  });

  it("dia vazio", () => {
    expect(resumoDoDia([])).toBe("Nada marcado");
  });
});

describe("posicaoDoAgora", () => {
  const itens = [visita("2026-10-28T13:00:00Z"), tarefa, visita("2026-10-28T17:30:00Z")];

  it("a linha do agora fica depois do que já começou", () => {
    expect(posicaoDoAgora(itens, new Date("2026-10-28T14:00:00Z"), "2026-10-28")).toBe(1);
    expect(posicaoDoAgora(itens, new Date("2026-10-28T12:00:00Z"), "2026-10-28")).toBe(0);
    expect(posicaoDoAgora(itens, new Date("2026-10-28T23:00:00Z"), "2026-10-28")).toBe(3);
  });

  it("só no dia de hoje", () => {
    expect(posicaoDoAgora(itens, new Date("2026-10-29T14:00:00Z"), "2026-10-28")).toBeNull();
  });
});

describe("passoDoDeslize", () => {
  it("arrastar para a esquerda vai para a próxima; para a direita, a anterior", () => {
    expect(passoDoDeslize(-80, 10)).toBe(1);
    expect(passoDoDeslize(90, -5)).toBe(-1);
  });

  it("toque curto ou rolagem vertical não troca a semana", () => {
    expect(passoDoDeslize(-30, 0)).toBe(0);
    expect(passoDoDeslize(-70, 120)).toBe(0);
  });
});

describe("deOutrosDias", () => {
  it("tira das próximas as visitas do dia que já está na lista", () => {
    const vs = [visita("2026-10-28T13:00:00Z"), visita("2026-10-29T12:30:00Z")];
    expect(deOutrosDias(vs, "2026-10-28").map((v) => v.inicio)).toEqual(["2026-10-29T12:30:00Z"]);
  });
});

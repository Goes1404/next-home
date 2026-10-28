import { describe, expect, it } from "vitest";
import { MAXIMO_POR_DIA, contarPorDia, ordenarItens, type ItemDaAgenda } from "./itens";

const visita = (id: string, inicio: string): ItemDaAgenda => ({
  tipo: "visita",
  id,
  inicio,
  leadId: "l1",
  nome: "Ana",
  telefone: null,
  imovel: null,
  confirmadaPeloCliente: false,
});
const tarefa = (id: string, inicio: string): ItemDaAgenda => ({
  tipo: "tarefa",
  id,
  inicio,
  titulo: "Ligar",
  leadId: null,
  nome: null,
});
const lembrete = (id: string, inicio: string): ItemDaAgenda => ({
  tipo: "lembrete",
  id,
  inicio,
  texto: "Pegar a chave",
  leadId: null,
});

describe("ordenarItens", () => {
  it("ordena pelo horário", () => {
    const itens = [tarefa("t", "2026-10-27T15:00:00Z"), visita("v", "2026-10-27T13:00:00Z")];
    expect(ordenarItens(itens).map((i) => i.id)).toEqual(["v", "t"]);
  });

  it("no mesmo horário: visita, tarefa, lembrete", () => {
    const mesmo = "2026-10-27T13:00:00Z";
    const itens = [lembrete("l", mesmo), tarefa("t", mesmo), visita("v", mesmo)];
    expect(ordenarItens(itens).map((i) => i.id)).toEqual(["v", "t", "l"]);
  });

  it("não muda a lista recebida", () => {
    const itens = [tarefa("t", "2026-10-27T15:00:00Z"), visita("v", "2026-10-27T13:00:00Z")];
    ordenarItens(itens);
    expect(itens.map((i) => i.id)).toEqual(["t", "v"]);
  });
});

describe("contarPorDia", () => {
  it("conta pelo dia de São Paulo", () => {
    expect(contarPorDia(["2026-11-01T01:30:00Z", "2026-10-31T15:00:00Z", "2026-11-01T12:00:00Z"])).toEqual({
      "2026-10-31": 2,
      "2026-11-01": 1,
    });
  });
});

describe("teto da lista do dia", () => {
  it("é de 30 itens (régua do Painel de Bolso)", () => {
    expect(MAXIMO_POR_DIA).toBe(30);
  });
});

import { describe, expect, it } from "vitest";
import { diasCitados, verificarCoerenciaVisita } from "./coerenciaVisita";

describe("Coerência entre o dia prometido e a data agendada", () => {
  it("aceita quando o texto e a data falam do mesmo dia", () => {
    // 25/08/2026 é uma terça.
    const r = verificarCoerenciaVisita("Pode ser terça às 10h?", "2026-08-25T10:00:00-03:00");
    expect(r.coerente).toBe(true);
  });

  it("REPROVA o caso real: texto diz sábado, data é domingo", () => {
    // Aconteceu numa conversa medida: o cliente pediu sábado, o texto
    // confirmou sábado, e o JSON trazia 23/08 — um domingo. Essa data iria
    // para leads.visita_agendada_em e para a agenda da corretora.
    const r = verificarCoerenciaVisita(
      "Vamos marcar para sábado às 10h. Vou confirmar a disponibilidade.",
      "2026-08-23T10:00:00-03:00",
    );
    expect(r.coerente).toBe(false);
    expect(r).toMatchObject({ motivo: "dia_divergente", diaNoTexto: 6, diaNaData: 0 });
  });

  it("REPROVA texto de terça com data de quinta", () => {
    // O outro caso medido: "Terça às 10h ou quarta às 15h?" com 27/08 (quinta).
    const r = verificarCoerenciaVisita(
      "Que tal terça às 10h ou quarta às 15h?",
      "2026-08-27T10:00:00-03:00",
    );
    expect(r.coerente).toBe(false);
  });

  it("aceita quando a data casa com o SEGUNDO dia citado", () => {
    // "terça ou quarta" com data de quarta está correto: o cliente escolhe.
    const r = verificarCoerenciaVisita(
      "Que tal terça às 10h ou quarta às 15h?",
      "2026-08-26T15:00:00-03:00",
    );
    expect(r.coerente).toBe(true);
  });

  it("sem dia citado não há o que conferir", () => {
    expect(verificarCoerenciaVisita("Amanhã de manhã funciona?", "2026-08-23T10:00:00-03:00").coerente).toBe(true);
  });

  it("usa o fuso de São Paulo, não UTC", () => {
    // 22/08 às 21h em -03:00 já é 23/08 em UTC. Pelo relógio de São Paulo,
    // ainda é sábado — e é o relógio do cliente que vale.
    expect(verificarCoerenciaVisita("sábado à noite", "2026-08-22T21:00:00-03:00").coerente).toBe(true);
  });

  it("reconhece 'terça-feira' e variações sem acento", () => {
    expect(diasCitados("terça-feira ou quinta")).toEqual([2, 4]);
    expect(diasCitados("pode ser sabado")).toEqual([6]);
  });
});

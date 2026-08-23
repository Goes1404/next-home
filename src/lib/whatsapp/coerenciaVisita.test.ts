import { describe, expect, it } from "vitest";
import { corrigirVisitaNoPassado, diasCitados, verificarCoerenciaVisita } from "./coerenciaVisita";

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

describe("corrigirVisitaNoPassado", () => {
  // 23/08/2026 é um domingo; o sábado anterior é 22/08 e o próximo, 29/08.
  const domingo = new Date("2026-08-23T15:00:00-03:00");

  it("rola para o próximo sábado quando o modelo devolve o que já passou", () => {
    const corrigida = corrigirVisitaNoPassado(
      "2026-08-22T10:00:00-03:00",
      "Podemos no sábado às 10h?",
      domingo,
    );
    expect(corrigida.slice(0, 10)).toBe("2026-08-29");
  });

  it("não mexe em data futura", () => {
    const iso = "2026-08-29T10:00:00-03:00";
    expect(corrigirVisitaNoPassado(iso, "sábado às 10h", domingo)).toBe(iso);
  });

  it("não corrige quando o dia da semana não bate com o texto", () => {
    // Texto promete terça, data é de um sábado que passou: divergência real.
    const iso = "2026-08-22T10:00:00-03:00";
    expect(corrigirVisitaNoPassado(iso, "Podemos na terça?", domingo)).toBe(iso);
  });

  it("não inventa quando o texto não cita dia nenhum", () => {
    const iso = "2026-08-22T10:00:00-03:00";
    expect(corrigirVisitaNoPassado(iso, "Combinado, te espero!", domingo)).toBe(iso);
  });
});

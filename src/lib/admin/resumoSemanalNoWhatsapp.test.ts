import { describe, expect, it } from "vitest";
import {
  comparar,
  jaMandouNaSemana,
  reaisCurto,
  semanasDoResumo,
  textoDoResumoSemanal,
  type SemanaDoGrupo,
} from "./resumoSemanalNoWhatsapp";

/** O texto do resumo semanal no WhatsApp do gestor (0246): curto, comparado, com quem está parado. */

const semana = (s: Partial<SemanaDoGrupo> = {}): SemanaDoGrupo => ({
  de: "2026-10-19",
  ate: "2026-10-25",
  leads: { semana: 12, anterior: 8 },
  visitas: { semana: 5, anterior: 5 },
  vendas: { semana: 1, anterior: 2, vgvSemana: 450_000 },
  parados: [],
  ...s,
});

describe("o resumo da semana", () => {
  it("traz leads, visitas e vendas contra a semana anterior", () => {
    const texto = textoDoResumoSemanal({ nomeDaCasa: "Next Home", semana: semana(), achado: null, linkDoPainel: "https://x/corretor/admin" });
    expect(texto).toContain("Sua semana na Next Home* (19/10 a 25/10)");
    expect(texto).toContain("Leads novos: *12* · ↑ 4 (8 na anterior)");
    expect(texto).toContain("Visitas feitas: *5* · igual à anterior");
    expect(texto).toContain("Vendas: *1* (R$ 450 mil) · ↓ 1 (2 na anterior)");
    expect(texto).toContain("Ninguém com lead parado");
    expect(texto.trim().endsWith("Painel: https://x/corretor/admin")).toBe(true);
  });

  it("diz quem está parado, os três mais parados por nome", () => {
    const texto = textoDoResumoSemanal({
      nomeDaCasa: "Casa",
      semana: semana({
        parados: [
          { nome: "Ana", quantos: 6 },
          { nome: "Caio", quantos: 3 },
          { nome: "Bia", quantos: 2 },
          { nome: "Davi", quantos: 1 },
        ],
      }),
      achado: null,
      linkDoPainel: "l",
    });
    expect(texto).toContain("Leads parados há 48h+: Ana (6), Caio (3), Bia (2) e mais 1");
  });

  it("o pior achado do relatório entra; achado bom não", () => {
    const critico = textoDoResumoSemanal({
      nomeDaCasa: "Casa",
      semana: semana(),
      achado: { gravidade: "critico", titulo: "O WhatsApp está fora do ar há 2 dias", detalhe: "" },
      linkDoPainel: "l",
    });
    expect(critico).toContain("⚠️ O WhatsApp está fora do ar há 2 dias");
    const ok = textoDoResumoSemanal({
      nomeDaCasa: "Casa",
      semana: semana(),
      achado: { gravidade: "ok", titulo: "A assistente respondeu 90%", detalhe: "" },
      linkDoPainel: "l",
    });
    expect(ok).not.toContain("90%");
  });

  it("venda sem VGV não mostra R$ 0", () => {
    const texto = textoDoResumoSemanal({
      nomeDaCasa: "Casa",
      semana: semana({ vendas: { semana: 0, anterior: 0, vgvSemana: 0 } }),
      achado: null,
      linkDoPainel: "l",
    });
    expect(texto).toContain("Vendas: *0* · igual à anterior");
  });

  it("cabe numa tela de celular", () => {
    const texto = textoDoResumoSemanal({
      nomeDaCasa: "Imobiliária com um nome bem comprido",
      semana: semana({ parados: Array.from({ length: 9 }, (_, i) => ({ nome: `Corretor ${i}`, quantos: 9 - i })) }),
      achado: { gravidade: "atencao", titulo: "60 disparos entregues, 1 resposta (2%)", detalhe: "" },
      linkDoPainel: "https://painel.exemplo.com.br/corretor/admin",
    });
    expect(texto.split("\n").length).toBeLessThanOrEqual(12);
    expect(texto.length).toBeLessThan(700);
  });
});

describe("as contas do resumo", () => {
  it("comparar", () => {
    expect(comparar({ semana: 3, anterior: 3 })).toBe("igual à anterior");
    expect(comparar({ semana: 0, anterior: 4 })).toBe("↓ 4 (4 na anterior)");
  });

  it("reais curtos", () => {
    expect(reaisCurto(1_250_000)).toBe("R$ 1,3 mi");
    expect(reaisCurto(450_000)).toBe("R$ 450 mil");
    expect(reaisCurto(800)).toBe("R$ 800");
  });

  it("a semana são os 7 dias até ontem; a anterior, os 7 antes", () => {
    // Segunda, 26/10/2026.
    expect(semanasDoResumo("2026-10-26")).toEqual({
      semana: { desde: "2026-10-19T00:00:00-03:00", ate: "2026-10-26T00:00:00-03:00", de: "2026-10-19", ateDia: "2026-10-25" },
      anterior: { desde: "2026-10-12T00:00:00-03:00", ate: "2026-10-19T00:00:00-03:00" },
    });
    // Virada de ano.
    expect(semanasDoResumo("2027-01-04").semana.de).toBe("2026-12-28");
  });

  it("uma vez por semana", () => {
    const agora = new Date("2026-10-26T11:05:00Z");
    expect(jaMandouNaSemana(null, agora)).toBe(false);
    expect(jaMandouNaSemana("2026-10-26T11:00:00Z", agora)).toBe(true);
    expect(jaMandouNaSemana("2026-10-19T11:00:00Z", agora)).toBe(false);
  });
});

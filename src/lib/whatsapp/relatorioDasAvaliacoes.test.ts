import { describe, expect, it } from "vitest";
import { horaDoRelatorioDasAvaliacoes, montarRelatorioDasAvaliacoes } from "./relatorioDasAvaliacoes";

const base = {
  nomeCorretor: "Bruna Cristal",
  respostas: 40,
  boas: 6,
  ruins: 4,
  porMotivo: { inventou: 2, robotico: 1 },
  ruinsSemMotivo: 1,
  semAvaliacao: 30,
  correcoes: 2,
  exemplos: [{ motivo: "inventou" as const, trecho: "O Manacá entrega em janeiro do ano que vem e tem 2 suítes." }],
  urlPainel: "https://exemplo.app",
};

describe("relatório semanal das avaliações", () => {
  it("agrupa os 👎 por motivo, com exemplo e o caminho para revisar", () => {
    const t = montarRelatorioDasAvaliacoes(base)!;
    expect(t).toMatch(/Bruna/);
    expect(t).toMatch(/respondeu \*40\* vezes/);
    expect(t).toMatch(/— Inventou: 2/);
    expect(t).toMatch(/— Robótica: 1/);
    expect(t).toMatch(/Sem motivo marcado: 1/);
    expect(t).toMatch(/\(Inventou\) "O Manacá/);
    expect(t).toMatch(/ensinou 2 respostas/);
    expect(t).toMatch(/30 respostas ficaram sem avaliação/);
    expect(t).toMatch(/exemplo\.app\/corretor\/conversas/);
    // O motivo mais frequente vem primeiro.
    expect(t.indexOf("Inventou: 2")).toBeLessThan(t.indexOf("Robótica: 1"));
  });

  it("semana sem resposta da IA não manda nada", () => {
    expect(montarRelatorioDasAvaliacoes({ ...base, respostas: 0 })).toBeNull();
  });

  it("sai na segunda de manhã em SP, uma vez", () => {
    const segunda10h = new Date("2026-10-05T13:00:00Z"); // segunda, 10h em SP
    expect(horaDoRelatorioDasAvaliacoes(segunda10h, null)).toBe(true);
    expect(horaDoRelatorioDasAvaliacoes(segunda10h, "2026-10-05")).toBe(false);
    expect(horaDoRelatorioDasAvaliacoes(new Date("2026-10-05T10:00:00Z"), null)).toBe(false); // 7h
    expect(horaDoRelatorioDasAvaliacoes(new Date("2026-10-06T13:00:00Z"), null)).toBe(false); // terça
  });
});

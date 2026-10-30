import { describe, expect, it } from "vitest";
import { linhaDaMeta } from "./DefinirMetasDaEquipe";

/** Corretor que entrou na equipe depois do primeiro render (30/10/2026, revisão). */
describe("metas da equipe: linha de quem chegou depois", () => {
  const meses = [{ chave: "2026-10", rotulo: "outubro", metas: { nova: { visitas: 4, propostas: null, vendas: 1 } } }];

  it("sem linha no estado, usa a meta do servidor", () => {
    expect(linhaDaMeta({ "2026-10": {} }, meses, "2026-10", "nova")).toEqual({ visitas: "4", propostas: "", vendas: "1" });
  });

  it("sem meta nenhuma, linha vazia (não quebra)", () => {
    expect(linhaDaMeta({}, meses, "2026-11", "outra")).toEqual({ visitas: "", propostas: "", vendas: "" });
  });

  it("o que foi digitado vale mais que o do servidor", () => {
    const digitado = { visitas: "9", propostas: "", vendas: "" };
    expect(linhaDaMeta({ "2026-10": { nova: digitado } }, meses, "2026-10", "nova")).toBe(digitado);
  });
});

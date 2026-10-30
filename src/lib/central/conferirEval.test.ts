import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { conferirCaso, type CasoDoCentral } from "./conferirEval";
import { FERRAMENTAS } from "./ferramentas";

const chamada = (nome: string, argumentos: Record<string, unknown> = {}) => [{ nome, argumentos, resultado: null }];
const caso = (c: Partial<CasoDoCentral>): CasoDoCentral => ({ id: "x", papel: "corretor", mensagem: "", ferramentaEsperada: null, ...c });

describe("conferirCaso", () => {
  it("nenhuma ferramenta esperada: acerta só sem chamada", () => {
    expect(conferirCaso(caso({}), []).ferramentaOk).toBe(true);
    expect(conferirCaso(caso({}), chamada("ajuda")).ferramentaOk).toBe(false);
  });

  it("texto casa sem acento e sem caixa; número com 1% de folga", () => {
    const c = caso({ ferramentaEsperada: "registrar_venda", argumentosEsperados: { lead: "joão", valor: 480000 } });
    expect(conferirCaso(c, chamada("registrar_venda", { lead: "Joao Pereira", valor: 480000 })).argumentosOk).toBe(true);
    expect(conferirCaso(c, chamada("registrar_venda", { lead: "Joao", valor: "480.000" })).argumentosOk).toBe(true);
    const errado = conferirCaso(c, chamada("registrar_venda", { lead: "Carla", valor: 48000 }));
    expect(errado.argumentosOk).toBe(false);
    expect(errado.argumentosErrados).toEqual(["lead", "valor"]);
  });

  it("pedido composto aceita qualquer uma das ferramentas como a primeira", () => {
    const c = caso({ ferramentaEsperada: ["cadastrar_lead", "visita"] });
    expect(conferirCaso(c, chamada("visita")).ferramentaOk).toBe(true);
    expect(conferirCaso(c, chamada("lembrete")).ferramentaOk).toBe(false);
  });

  it("ferramenta errada não conta argumento", () => {
    const c = caso({ ferramentaEsperada: "visita", argumentosEsperados: { lead: "ana" } });
    expect(conferirCaso(c, chamada("consultar_lead", { lead: "ana" }))).toMatchObject({ ferramentaOk: false, argumentosOk: null });
  });
});

describe("eval/golden/central.json", () => {
  const casos = JSON.parse(readFileSync("eval/golden/central.json", "utf8")) as CasoDoCentral[];
  const nomes = new Set(FERRAMENTAS.map((f) => f.nome));

  it("tem 100 casos com id único e só ferramentas do catálogo", () => {
    expect(casos).toHaveLength(100);
    expect(new Set(casos.map((c) => c.id)).size).toBe(100);
    for (const c of casos) {
      const esperadas = c.ferramentaEsperada === null ? [] : [c.ferramentaEsperada].flat();
      for (const n of esperadas) expect(nomes.has(n), `${c.id}: ${n}`).toBe(true);
    }
  });

  it("cobre todas as ferramentas, e as de gestor só aparecem com papel de gestor", () => {
    const usadas = new Set(casos.flatMap((c) => (c.ferramentaEsperada === null ? [] : [c.ferramentaEsperada].flat())));
    expect([...nomes].filter((n) => !usadas.has(n))).toEqual([]);
    for (const c of casos) {
      for (const n of c.ferramentaEsperada === null ? [] : [c.ferramentaEsperada].flat()) {
        if (FERRAMENTAS.find((f) => f.nome === n)?.soGestor) expect(c.papel, c.id).toBe("gestor");
      }
    }
  });
});

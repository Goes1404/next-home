import { describe, expect, it } from "vitest";
import { compatibilidade, ordenarCompativeis, regiaoCasa } from "./compatibilidade";

const vitra = {
  cidade: "Barueri",
  bairro: "Alphaville Empresarial",
  precoAPartir: 480_000,
  dormitorios: [2, 3],
};

describe("compatibilidade lead × imóvel", () => {
  it("lead sem nenhum critério declarado NÃO combina com nada", () => {
    expect(compatibilidade({}, vitra).combina).toBe(false);
  });

  it("região casa por bairro ou cidade, sem acento e sem caixa", () => {
    expect(regiaoCasa("alphaville", vitra)).toBe(true);
    expect(regiaoCasa("Barueri", vitra)).toBe(true);
    expect(regiaoCasa("Zona Sul de SP", vitra)).toBe(false);
  });

  it("critério declarado e não atendido reprova", () => {
    expect(compatibilidade({ dormitoriosMin: 4 }, vitra).combina).toBe(false);
    expect(compatibilidade({ orcamentoMax: 300_000 }, vitra).combina).toBe(false);
    expect(compatibilidade({ regiaoInteresse: "Osasco" }, vitra).combina).toBe(false);
  });

  it("orçamento tem 10% de folga", () => {
    expect(compatibilidade({ orcamentoMax: 450_000 }, vitra).combina).toBe(true);
  });

  it("imóvel sem planta cadastrada não reprova dormitórios: não sabemos", () => {
    const r = compatibilidade(
      { regiaoInteresse: "Alphaville", dormitoriosMin: 3 },
      { ...vitra, dormitorios: [] },
    );
    expect(r.combina).toBe(true);
    expect(r.motivos).toEqual(["região (Alphaville)"]);
  });

  it("ordena do mais para o menos compatível e tira quem não combina", () => {
    const leads = [
      { id: "a", perfil: { regiaoInteresse: "Barueri" } },
      { id: "b", perfil: { regiaoInteresse: "Alphaville", dormitoriosMin: 3, orcamentoMax: 600_000 } },
      { id: "c", perfil: { dormitoriosMin: 5 } },
    ];
    const r = ordenarCompativeis(leads, (l) => compatibilidade(l.perfil, vitra));
    expect(r.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

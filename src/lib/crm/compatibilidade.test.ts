import { describe, expect, it } from "vitest";
import { compatibilidade, ordenarCompativeis, perfilDoLead, regiaoCasa, tetoPelaRenda } from "./compatibilidade";
import type { ParametrosCredito } from "@/lib/credito/tipos";

const P: ParametrosCredito = {
  faixas: [
    { nome: "Faixa 3", rendaMax: 8000, subsidioMaximo: 0, taxaAnual: 0.0766 },
    { nome: "Faixa 4", rendaMax: 12000, subsidioMaximo: 0, taxaAnual: 0.1 },
  ],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: {},
  conferidoEm: "2026-09-09",
};

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

describe("orçamento que vem do dossiê e da renda", () => {
  it("a ficha manda; o dossiê só preenche o vazio", () => {
    expect(perfilDoLead({ orcamento_max: "500000" }, { orcamento_max: 300000 }, P).orcamentoMax).toBe(500000);
    expect(perfilDoLead({ orcamento_max: null }, { orcamento_max: "300000" }, P).orcamentoMax).toBe(300000);
  });

  it("renda vira teto pela mesma conta do simulador, e só vale sem orçamento dito", () => {
    const teto = tetoPelaRenda(8000, P)!;
    expect(teto).toBeGreaterThan(200000);
    expect(teto).toBeLessThan(500000);
    const barato = { ...vitra, precoAPartir: Math.round(teto * 0.9) };
    const caro = { ...vitra, precoAPartir: Math.round(teto * 1.5) };
    const pelaRenda = { tetoPelaRenda: teto };
    expect(compatibilidade(pelaRenda, barato).motivos).toContain("cabe no que a renda financia");
    expect(compatibilidade(pelaRenda, caro).combina).toBe(false);
    // Orçamento dito ganha da renda, mesmo quando a renda aguentaria mais.
    expect(compatibilidade({ orcamentoMax: teto * 0.5, tetoPelaRenda: teto }, barato).combina).toBe(false);
  });

  it("sem renda não há teto", () => {
    expect(tetoPelaRenda(null, P)).toBeNull();
    expect(tetoPelaRenda(0, P)).toBeNull();
  });
});

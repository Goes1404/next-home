import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { PARAMETROS_PADRAO } from "@/lib/credito/parametrosPadrao";
import {
  blocoDeCapacidade,
  rendaDaFala,
  rendaNaConversa,
  tetoDeCompra,
} from "./capacidadeDeCompra";

const imovel = (nome: string, precoAPartir: number | null) =>
  ({ nome, slug: nome.toLowerCase().replace(/\s+/g, "-"), precoAPartir }) as unknown as Empreendimento;

describe("a renda que o cliente disse", () => {
  it("lê os jeitos de escrever renda", () => {
    expect(rendaDaFala("minha renda é 2.500", false)).toBe(2500);
    expect(rendaDaFala("ganho uns 5 mil por mês", false)).toBe(5000);
    expect(rendaDaFala("5,5 mil", true)).toBe(5500);
    expect(rendaDaFala("8k", true)).toBe(8000);
    expect(rendaDaFala("6000", true)).toBe(6000);
  });

  it("soma quando ele diz que soma", () => {
    expect(rendaDaFala("eu ganho 3 mil e minha esposa 2 mil, somando", false)).toBe(5000);
  });

  it("aluguel e preço de imóvel não são renda", () => {
    expect(rendaDaFala("pago 900 de aluguel", true)).toBeNull();
    expect(rendaDaFala("vi um de 400 mil", false)).toBeNull();
    expect(rendaDaFala("quero 3 dormitórios", true)).toBeNull();
  });

  it("número solto só conta se a IA acabou de perguntar a renda", () => {
    expect(rendaDaFala("uns 4 mil", false)).toBeNull();
    const historico = [{ remetente: "bot", texto: "Qual é a renda média da família por mês?" }];
    expect(rendaNaConversa(historico, "uns 4 mil")).toBe(4000);
  });
});

describe("o teto de compra", () => {
  it("sai da renda pela conta do simulador", () => {
    const t = tetoDeCompra({ rendaMensal: 2500 }, PARAMETROS_PADRAO);
    expect(t?.origem).toBe("renda");
    expect(t!.valor).toBeGreaterThan(100000);
    expect(t!.valor).toBeLessThan(400000);
  });

  it("o orçamento que ele disse vence", () => {
    expect(tetoDeCompra({ rendaMensal: 2500, orcamentoMax: 500000 }, PARAMETROS_PADRAO)).toEqual({
      valor: 500000,
      origem: "orcamento",
      renda: 2500,
    });
  });

  it("sem renda nem orçamento, não há teto", () => {
    expect(tetoDeCompra({}, PARAMETROS_PADRAO)).toBeNull();
  });
});

describe("a indicação usa o teto", () => {
  const catalogo = [imovel("Caro", 800000), imovel("Sem Piso", null), imovel("Cabe", 250000)];

  it("o bloco nomeia quem cabe e proíbe dizer o valor ao cliente", () => {
    const b = blocoDeCapacidade({ valor: 300000, origem: "renda", renda: 2500 }, catalogo);
    expect(b).toMatch(/CABEM: Cabe/);
    expect(b).toMatch(/NÃO diga esse valor/);
  });

  it("sem nenhum que cabe, manda ser franco", () => {
    expect(blocoDeCapacidade({ valor: 100000, origem: "renda", renda: 1200 }, catalogo)).toMatch(/NENHUM/);
  });
});

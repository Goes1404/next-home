import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { estagioIncompativel, estagioPedidoNaFala } from "./estagioIncompativel";

function imovel(p: Partial<Empreendimento> & { slug: string }): Empreendimento {
  return {
    nome: p.slug,
    cidade: "Barueri",
    bairro: "Centro",
    status: "lancamento",
    precoAPartir: null,
    entregaPrevista: null,
    publicado: true,
    ...p,
  } as Empreendimento;
}

const domParque = imovel({
  slug: "dom-parque",
  nome: "Dom Parque",
  bairro: "Jardim Tupanci",
  status: "lancamento",
  entregaPrevista: "2030-06-01",
  precoAPartir: 480_000,
});
const prontoBarueri = imovel({
  slug: "vitra",
  nome: "Vitra",
  bairro: "Alphaville",
  status: "pronto_para_morar",
  precoAPartir: 520_000,
});
const prontoOsasco = imovel({
  slug: "osasco-pronto",
  nome: "Osasco Pronto",
  cidade: "Osasco",
  status: "pronto_para_morar",
  precoAPartir: 470_000,
});
const catalogo = [domParque, prontoBarueri, prontoOsasco];

describe("estagioPedidoNaFala", () => {
  it("lê o pedido de pronto da cliente do Dom Parque", () => {
    expect(estagioPedidoNaFala("Pronto pra morar\nQual é o valor da renda que pede?")).toBe("pronto");
  });

  it("'pronto' solto só vale como resposta à pergunta de estágio", () => {
    expect(estagioPedidoNaFala("pronto, pode ser")).toBeNull();
    expect(estagioPedidoNaFala("pronto", true)).toBe("pronto");
  });

  it("negação, indiferença e planta não são pedido de pronto", () => {
    expect(estagioPedidoNaFala("não precisa ser pronto pra morar")).toBeNull();
    expect(estagioPedidoNaFala("tanto faz, pronto ou na planta")).toBeNull();
    expect(estagioPedidoNaFala("pode ser na planta")).toBe("planta");
  });
});

describe("estagioIncompativel", () => {
  it("quer pronto e o foco é lançamento: diz o ano da entrega e oferece um pronto da mesma cidade", () => {
    const r = estagioIncompativel({ falaDaVez: "Pronto pra morar", foco: domParque, catalogo })!;
    expect(r.bloco).toContain("Dom Parque");
    expect(r.bloco).toContain("2030");
    expect(r.alternativa?.slug).toBe("vitra");
  });

  it("foco já pronto, ou sem foco, não gera bloco", () => {
    expect(estagioIncompativel({ falaDaVez: "pronto pra morar", foco: prontoBarueri, catalogo })).toBeNull();
    expect(estagioIncompativel({ falaDaVez: "pronto pra morar", foco: null, catalogo })).toBeNull();
  });

  it("sem pronto no catálogo, não inventa alternativa", () => {
    const r = estagioIncompativel({ falaDaVez: "pronto pra morar", foco: domParque, catalogo: [domParque] })!;
    expect(r.alternativa).toBeNull();
    expect(r.bloco).toContain("corretor busca");
  });

  it("o turno põe o bloco logo depois da jogada e libera a alternativa da trava", () => {
    const codigo = readFileSync("src/lib/whatsapp/turnoDeAtendimento.ts", "utf8");
    expect(codigo).toContain("estagio?.bloco");
    expect(codigo).toContain("estagio.alternativa.slug");
  });
});

import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { REGIOES, regiaoPorSlug, regioesComEstoque } from "./regioes";

function imovel(p: Partial<Empreendimento>): Empreendimento {
  return {
    slug: p.slug ?? "x",
    nome: p.nome ?? "Imóvel",
    cidade: p.cidade ?? "Barueri",
    bairro: p.bairro ?? "Centro",
    precoAPartir: p.precoAPartir ?? null,
    galeria: p.galeria ?? [],
    ...p,
  } as Empreendimento;
}

describe("regioesComEstoque", () => {
  it("some com a região que não tem imóvel publicado", () => {
    /*
     * O defeito que originou este módulo: dois chips da home ("Santana de
     * Parnaíba", "Itapevi") apontavam para a listagem INTEIRA porque não
     * havia cadastro neles. Link que promete uma região e entrega o catálogo
     * todo não parece link errado — parece filtro quebrado.
     */
    const regioes = regioesComEstoque([imovel({ cidade: "Osasco", bairro: "Centro" })]);
    expect(regioes.map((r) => r.slug)).toEqual(["osasco"]);
  });

  it("ordena da região com mais imóveis para a com menos", () => {
    const regioes = regioesComEstoque([
      imovel({ slug: "a", cidade: "Osasco" }),
      imovel({ slug: "b", cidade: "Itapevi" }),
      imovel({ slug: "c", cidade: "Itapevi" }),
    ]);
    expect(regioes.map((r) => r.slug)).toEqual(["itapevi", "osasco"]);
  });

  it("Alphaville conta DENTRO de Barueri, e as duas mostram o imóvel", () => {
    // Sobreposição de propósito: quem procura "Alphaville" e quem procura
    // "Barueri" fazem buscas diferentes, e as duas têm de achar.
    const regioes = regioesComEstoque([imovel({ cidade: "Barueri", bairro: "Alphaville" })]);
    expect(regioes.map((r) => r.slug).sort()).toEqual(["alphaville", "barueri"]);
  });

  it("o preço mínimo ignora nulo e zero", () => {
    const [regiao] = regioesComEstoque([
      imovel({ slug: "a", cidade: "Osasco", precoAPartir: null }),
      imovel({ slug: "b", cidade: "Osasco", precoAPartir: 0 }),
      imovel({ slug: "c", cidade: "Osasco", precoAPartir: 600_000 }),
    ]);
    expect(regiao.precoMinimo).toBe(600_000);
  });

  it("sem preço em nenhum imóvel, o mínimo é nulo — não zero", () => {
    // Zero apareceria na tela como "a partir de R$ 0".
    const [regiao] = regioesComEstoque([imovel({ cidade: "Osasco", precoAPartir: null })]);
    expect(regiao.precoMinimo).toBeNull();
  });

  it("a capa sai da GALERIA, nunca de `capa`", () => {
    /*
     * `mapEmpreendimento` devolve o logotipo da casa quando não há foto (ver
     * `capa-de-empreendimento-nunca-e-nula` no vault), e cartão de região com
     * o logotipo esticado é pior que cartão sem foto.
     */
    const [semFoto] = regioesComEstoque([imovel({ cidade: "Osasco", galeria: [] })]);
    expect(semFoto.capaUrl).toBeNull();

    const [comFoto] = regioesComEstoque([
      imovel({ cidade: "Osasco", galeria: [{ url: "/f.jpg" }] as Empreendimento["galeria"] }),
    ]);
    expect(comFoto.capaUrl).toBe("/f.jpg");
  });
});

describe("regiaoPorSlug", () => {
  it("acha cada região declarada e recusa slug inventado", () => {
    for (const r of REGIOES) expect(regiaoPorSlug(r.slug)?.nome).toBe(r.nome);
    expect(regiaoPorSlug("moema")).toBeUndefined();
  });
});

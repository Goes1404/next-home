import { describe, expect, it } from "vitest";
import { homeJsonLd, ID_ORGANIZACAO, nomesAlternativos, trilhaJsonLd, websiteJsonLd } from "./dadosEstruturados";
import { site } from "./site";

describe("dados estruturados do site público", () => {
  it("a home tem organização e site no mesmo grafo, ligados por @id", () => {
    const g = homeJsonLd();
    expect(g["@context"]).toBe("https://schema.org");
    const tipos = g["@graph"].map((n) => n["@type"]);
    expect(tipos).toEqual(["RealEstateAgent", "WebSite"]);
    const web = g["@graph"][1] as ReturnType<typeof websiteJsonLd>;
    expect(web.publisher["@id"]).toBe(ID_ORGANIZACAO);
  });

  it("o nome curto do site é o mesmo sufixo dos títulos", () => {
    // O template do layout raiz é `%s · ${site.nome}`; o Google escolhe o nome
    // do site quando WebSite.name e o sufixo concordam.
    expect(websiteJsonLd().name).toBe(site.nome);
  });

  it("os nomes alternativos cobrem como as pessoas procuram a marca", () => {
    const n = nomesAlternativos();
    expect(n).toContain("Next Home");
    expect(n).toContain("Next Home Imóveis");
    expect(n).toContain("Next Home Imobiliária");
    expect(n).not.toContain(site.nomeCompleto);
  });

  it("a busca declarada usa o parâmetro que a listagem lê", () => {
    expect(websiteJsonLd().potentialAction.target.urlTemplate).toContain("/empreendimentos?busca={termo}");
  });

  it("a trilha numera e absolutiza as URLs", () => {
    const t = trilhaJsonLd([
      { nome: "Início", url: "/" },
      { nome: "Empreendimentos", url: "/empreendimentos" },
      { nome: "Joy", url: "/empreendimentos/joy" },
    ]);
    expect(t.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(t.itemListElement[2].item).toBe(`${site.url}/empreendimentos/joy`);
    expect(t.itemListElement[0].item).toBe(`${site.url}/`);
  });
});

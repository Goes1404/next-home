import { describe, expect, it } from "vitest";
import {
  homeJsonLd,
  idOrganizacao,
  nomesAlternativos,
  organizacaoJsonLd,
  trilhaJsonLd,
  websiteJsonLd,
} from "./dadosEstruturados";
import { site } from "./site";
import { GRUPO_NEXT_HOME_ID } from "./grupos/grupo";
import { marcaDoGrupo } from "./sites/marca";

const casa = marcaDoGrupo({ grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: site.url });
const outro = marcaDoGrupo({
  grupoId: "33333333-3333-3333-3333-333333333333",
  nome: "Imobiliária Sol",
  url: "https://imobsol.com.br",
});

describe("dados estruturados do site público", () => {
  it("a home tem organização e site no mesmo grafo, ligados por @id", () => {
    const g = homeJsonLd(casa);
    expect(g["@context"]).toBe("https://schema.org");
    const tipos = g["@graph"].map((n) => n["@type"]);
    expect(tipos).toEqual(["RealEstateAgent", "WebSite"]);
    const web = g["@graph"][1] as ReturnType<typeof websiteJsonLd>;
    expect(web.publisher["@id"]).toBe(idOrganizacao(casa));
  });

  it("o nome curto do site é o mesmo sufixo dos títulos", () => {
    // O template do layout é `%s · ${marca.nome}`; o Google escolhe o nome
    // do site quando WebSite.name e o sufixo concordam.
    expect(websiteJsonLd(casa).name).toBe(site.nome);
    expect(websiteJsonLd(outro).name).toBe("Imobiliária Sol");
  });

  it("os nomes alternativos cobrem como as pessoas procuram a marca", () => {
    const n = nomesAlternativos(casa);
    expect(n).toContain("Next Home");
    expect(n).toContain("Next Home Imóveis");
    expect(n).toContain("Next Home Imobiliária");
    expect(n).not.toContain(site.nomeCompleto);
  });

  it("a busca declarada usa o parâmetro que a listagem lê", () => {
    expect(websiteJsonLd(casa).potentialAction.target.urlTemplate).toContain("/empreendimentos?busca={termo}");
  });

  it("a trilha numera e absolutiza as URLs no endereço do site", () => {
    const t = trilhaJsonLd(casa, [
      { nome: "Início", url: "/" },
      { nome: "Empreendimentos", url: "/empreendimentos" },
      { nome: "Joy", url: "/empreendimentos/joy" },
    ]);
    expect(t.itemListElement.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(t.itemListElement[2].item).toBe(`${casa.url}/empreendimentos/joy`);
    expect(t.itemListElement[0].item).toBe(`${casa.url}/`);
    expect(trilhaJsonLd(outro, [{ nome: "Início", url: "/" }]).itemListElement[0].item).toBe("https://imobsol.com.br/");
  });

  it("a organização da Next Home tem endereço, telefone e redes", () => {
    const o = organizacaoJsonLd(casa) as Record<string, unknown>;
    expect(o.address).toBeDefined();
    expect(o.telephone).toEqual(site.whatsapp.map((w) => `+${w.numero}`));
    expect(o.sameAs).toBeDefined();
  });

  it("a organização de outro grupo é dele, sem nada da Next Home", () => {
    const o = organizacaoJsonLd(outro);
    expect(o["@id"]).toBe("https://imobsol.com.br/#organizacao");
    const texto = JSON.stringify(homeJsonLd(outro));
    for (const proibido of [site.nome, site.endereco.logradouro, site.whatsapp[0].numero, "nexthome", "supabase"]) {
      expect(texto.toLowerCase(), proibido).not.toContain(proibido.toLowerCase());
    }
  });
});

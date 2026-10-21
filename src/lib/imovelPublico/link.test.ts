import { describe, expect, it } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import { caminhoDaFichaPublica, linksDoImovel, montarLinkDoImovel } from "./link";

const OUTRO = "22222222-2222-2222-2222-222222222222";
const PAINEL = "https://astroimob.vercel.app";

describe("montarLinkDoImovel", () => {
  it("grupo 1: exatamente o link de sempre, mesmo com host, slug de grupo ou corretor", () => {
    const base = { grupoId: GRUPO_NEXT_HOME_ID, hostPrincipal: "x.com.br", grupoSlug: "nexthome", painelUrl: PAINEL };
    expect(montarLinkDoImovel(base, "vitra", "bruna")).toBe(`${site.url}/empreendimentos/vitra`);
    expect(montarLinkDoImovel({ ...base, hostPrincipal: null, grupoSlug: null }, "vitra")).toBe(
      `${site.url}/empreendimentos/vitra`,
    );
  });

  it("grupo com endereço principal: a página do imóvel no site dele", () => {
    const base = { grupoId: OUTRO, hostPrincipal: "Imobsol.com.br", grupoSlug: "imobsol", painelUrl: PAINEL };
    expect(montarLinkDoImovel(base, "vitra", "bruna")).toBe("https://imobsol.com.br/empreendimentos/vitra");
  });

  it("grupo sem site: a ficha pública do painel, com o corretor", () => {
    const base = { grupoId: OUTRO, hostPrincipal: null, grupoSlug: "imobsol", painelUrl: PAINEL };
    expect(montarLinkDoImovel(base, "vitra", "bruna")).toBe(`${PAINEL}/imovel/imobsol/vitra?c=bruna`);
    expect(montarLinkDoImovel(base, "vitra")).toBe(`${PAINEL}/imovel/imobsol/vitra`);
  });

  it("corretor que não é slug não vai para a URL", () => {
    const base = { grupoId: OUTRO, hostPrincipal: null, grupoSlug: "imobsol", painelUrl: PAINEL };
    expect(montarLinkDoImovel(base, "vitra", "a&b=c")).toBe(`${PAINEL}/imovel/imobsol/vitra`);
  });

  it("nunca devolve o endereço da Next Home para outro grupo", () => {
    const semSlug = { grupoId: OUTRO, hostPrincipal: null, grupoSlug: null, painelUrl: PAINEL };
    expect(montarLinkDoImovel(semSlug, "vitra", "bruna")).not.toContain("nexthomeimoveis");
  });
});

describe("caminhoDaFichaPublica", () => {
  it("monta o caminho com ?c= só quando o corretor serve", () => {
    expect(caminhoDaFichaPublica("imobsol", "vitra", "bruna")).toBe("/imovel/imobsol/vitra?c=bruna");
    expect(caminhoDaFichaPublica("imobsol", "vitra", null)).toBe("/imovel/imobsol/vitra");
  });
});

describe("linksDoImovel", () => {
  it("reconhece os links de página de cada destino", () => {
    const next = linksDoImovel({ grupoId: GRUPO_NEXT_HOME_ID, hostPrincipal: null, grupoSlug: null });
    expect(next.reconhecer(`olha ${site.url}/empreendimentos/vitra aqui`)).toEqual([
      { inteiro: `${site.url}/empreendimentos/vitra`, slug: "vitra" },
    ]);

    const comSite = linksDoImovel({ grupoId: OUTRO, hostPrincipal: "imobsol.com.br", grupoSlug: "imobsol" });
    expect(comSite.reconhecer("https://imobsol.com.br/empreendimentos/vitra")).toHaveLength(1);
    expect(comSite.reconhecer(`${site.url}/empreendimentos/vitra`)).toHaveLength(0);

    const semSite = linksDoImovel({ grupoId: OUTRO, hostPrincipal: null, grupoSlug: "imobsol", painelUrl: PAINEL });
    expect(semSite.reconhecer(`veja ${PAINEL}/imovel/imobsol/vitra?c=bruna, ok`)).toEqual([
      { inteiro: `${PAINEL}/imovel/imobsol/vitra?c=bruna`, slug: "vitra" },
    ]);
  });

  it("o catálogo é do site do grupo; sem site não há link próprio", () => {
    expect(linksDoImovel({ grupoId: OUTRO, hostPrincipal: "imobsol.com.br", grupoSlug: "i" }).catalogo("bruna")).toBe(
      "https://imobsol.com.br/?corretor=bruna",
    );
    expect(linksDoImovel({ grupoId: OUTRO, hostPrincipal: null, grupoSlug: "i" }).catalogo("bruna")).toBeNull();
  });
});

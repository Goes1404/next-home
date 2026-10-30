import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { atalhosDoMenu } from "./PaletaDeBusca";

/**
 * Os atalhos da busca rápida seguem o menu de quem busca (30/10/2026,
 * revisão): o ramo da conta e o papel. Antes a paleta listava o catálogo de
 * imóveis para todo ramo e o "Indique e ganhe" (do gestor) para o corretor.
 */
const hrefs = (ehGestor: boolean, ramo: Parameters<typeof atalhosDoMenu>[2]) => atalhosDoMenu(ehGestor, "imobiliaria", ramo).map((a) => a.href);

describe("atalhos da paleta de busca", () => {
  it("o corretor não vê o que é só do gestor na conta", () => {
    expect(hrefs(false, "imobiliaria")).not.toContain("/corretor/indique");
    expect(hrefs(true, "imobiliaria")).toContain("/corretor/indique");
  });

  it("fora da imobiliária: nada de catálogo de imóveis nem de consultor", () => {
    const seguros = hrefs(true, "seguros");
    for (const href of ["/corretor/imoveis", "/corretor/imoveis/novo", "/corretor/links", "/corretor/consultor"]) {
      expect(seguros, href).not.toContain(href);
    }
    expect(hrefs(true, "imobiliaria")).toContain("/corretor/imoveis/novo");
  });

  it("as recentes são guardadas por usuário e o placeholder segue o ramo", () => {
    const fonte = readFileSync("src/app/corretor/(painel)/_componentes/busca/PaletaDeBusca.tsx", "utf8");
    expect(fonte).toContain("useGuardadoNoAparelho(chaveDasRecentes(usuarioId))");
    expect(fonte).toContain('"Nome, telefone ou tela"');
    expect(readFileSync("src/app/corretor/LimparSaida.tsx", "utf8")).toContain("ehChaveDasRecentes(chave)");
  });
});

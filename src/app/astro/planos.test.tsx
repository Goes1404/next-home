import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NOME_CURTO_NA_VENDA, PLANOS_CONTRATAVEIS } from "@/lib/plataforma/pedidoDeContratacao";
import { RAMOS } from "@/lib/ramos/ramos";
import PaginaDaAstro from "./page";

/**
 * Os cartões de plano da página de vendas levam ao assistente de
 * contratação (29/10/2026, "permita a pessoa clicar no plano, e leve ela
 * para as próximas telas"): cada cartão tem UM link de verdade, "Contratar
 * <plano>", para `/astro/contratar?plano=<id>`, com os ids que o assistente
 * entende.
 */
describe("página de vendas: contratar pelo cartão do plano", () => {
  const html = renderToStaticMarkup(<PaginaDaAstro />);
  const links = [...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)].map((m) => ({
    href: m[1].replaceAll("&amp;", "&"),
    texto: m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
  }));

  it.each(PLANOS_CONTRATAVEIS)("o cartão %s leva ao assistente com o plano marcado", (id) => {
    // O plano de equipe é "Empresa" na página de vendas (0244): ela fala com todo ramo.
    const nome = NOME_CURTO_NA_VENDA[id];
    const doPlano = links.filter((l) => l.href === `/astro/contratar?plano=${id}`);
    expect(doPlano).toHaveLength(1);
    // A seta é decorativa (aria-hidden) e o espaço até ela vem do `gap` do CSS.
    expect(doPlano[0].texto.replace("→", "").trim()).toBe(`Contratar ${nome}`);
    expect(html).toMatch(/<span aria-hidden="true"[^>]*>→<\/span>/);
  });

  it("o fechamento oferece escolher o plano no assistente", () => {
    expect(links.some((l) => l.href === "/astro/contratar" && l.texto === "Escolher meu plano")).toBe(true);
  });

  it("o fechamento e o rodapé levam ao Fale com a Astro (29/10/2026)", () => {
    expect(links.filter((l) => l.href === "/astro/contato" && l.texto === "Fale com a Astro")).toHaveLength(2);
  });

  it("o topo leva aos planos", () => {
    expect(links.some((l) => l.href === "#planos" && /Ver planos/.test(l.texto))).toBe(true);
  });

  it("Para quem é (0244): um cartão por ramo, levando ao assistente com o ramo marcado", () => {
    for (const ramo of RAMOS) {
      expect(links.filter((l) => l.href === `/astro/contratar?ramo=${ramo}`), ramo).toHaveLength(1);
    }
  });

  it("o texto não é mais só de imobiliária", () => {
    expect(html).toContain("corretoras de seguros");
    expect(html).toContain("escritórios de advocacia");
    expect(html).not.toContain("Para imobiliárias com equipe e para corretores autônomos.");
  });
});

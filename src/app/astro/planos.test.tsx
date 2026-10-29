import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PLANOS_CONTRATAVEIS } from "@/lib/plataforma/pedidoDeContratacao";
import { ROTULO_DO_PLANO } from "@/lib/plataforma/rotulosDoGrupo";
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
    const nome = ROTULO_DO_PLANO[id];
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
});

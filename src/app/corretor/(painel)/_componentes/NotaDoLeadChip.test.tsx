import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotaDoLeadChip } from "./NotaDoLeadChip";

/*
 * O chip da nota do lead (30/10/2026): o rótulo ESCRITO (a cor nunca
 * carrega o sentido sozinha), o número e o motivo acessível; e as quatro
 * telas que precisam mostrá-lo.
 */
describe("NotaDoLeadChip", () => {
  it("quente: rótulo, número e motivo no title e no aria-label", () => {
    const html = renderToStaticMarkup(<NotaDoLeadChip nota={{ score: 82, label: "quente", motivo: "Visita marcada para 01/11" }} />);
    expect(html).toContain("Quente · 82");
    expect(html).toContain('data-nota="quente"');
    expect(html).toContain("text-perigo");
    expect(html).toContain('title="Nota 82/100 — Visita marcada para 01/11"');
    expect(html).toContain("Lead quente, nota 82 de 100: Visita marcada para 01/11");
    // Na lista o motivo fica só no title.
    expect(html).not.toContain(">Visita marcada para 01/11<");
  });

  it("morno e frio têm cores próprias; com motivo, o texto aparece ao lado", () => {
    expect(renderToStaticMarkup(<NotaDoLeadChip nota={{ score: 50, label: "morno", motivo: "" }} />)).toContain("text-alerta");
    const frio = renderToStaticMarkup(<NotaDoLeadChip comMotivo nota={{ score: 12, label: "frio", motivo: "Sem resposta há 20 dias" }} />);
    expect(frio).toContain("Frio · 12");
    expect(frio).toContain("text-info");
    expect(frio).toContain(">Sem resposta há 20 dias<");
  });

  it("sem nota, nada", () => {
    expect(renderToStaticMarkup(<NotaDoLeadChip nota={null} />)).toBe("");
    expect(renderToStaticMarkup(<NotaDoLeadChip nota={undefined} />)).toBe("");
  });

  it("aparece na lista, no funil, na ficha e nos Leads da equipe", () => {
    const raiz = join(process.cwd(), "src/app/corretor/(painel)");
    for (const arquivo of ["leads/TabelaLeads.tsx", "funil/Quadro.tsx", "leads/[id]/page.tsx", "admin/leads/page.tsx"]) {
      expect(readFileSync(join(raiz, arquivo), "utf8"), arquivo).toContain("<NotaDoLeadChip");
    }
    // A lista ordena pelos mais quentes; o gestor chega lá pela equipe.
    expect(readFileSync(join(raiz, "leads/ListaLeads.tsx"), "utf8")).toContain('ordem: maisQuentes ? "" : "quentes"');
    expect(readFileSync(join(raiz, "admin/leads/page.tsx"), "utf8")).toContain("corretor=equipe&ordem=quentes");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PainelDeNumeros as Painel } from "@/lib/plataforma/painelDeNumeros";
import { PainelDeNumeros } from "./PainelDeNumeros";

/** O painel de números (29/10/2026): todo número leva à lista filtrada ou à tela do assunto. */

const PAINEL: Painel = {
  receitaMensal: 424.5,
  pagantes: 2,
  ativas: 4,
  suspensas: 1,
  canceladas: 1,
  emAberto: { contas: 2, valor: 424.5 },
  semUso: null,
  ia: { respostas: 940, custoBrl: 162.35, contasEmAlerta: 2 },
  novasPorMes: [
    { mes: "2026-05", rotulo: "mai", total: 0 },
    { mes: "2026-06", rotulo: "jun", total: 1 },
    { mes: "2026-07", rotulo: "jul", total: 0 },
    { mes: "2026-08", rotulo: "ago", total: 3 },
    { mes: "2026-09", rotulo: "set", total: 1 },
    { mes: "2026-10", rotulo: "out", total: 2 },
  ],
};

describe("PainelDeNumeros", () => {
  const html = renderToStaticMarkup(<PainelDeNumeros painel={PAINEL} pedidosNovos={3} chamadosAbertos={null} />);

  it("cada indicador é um link para a lista filtrada", () => {
    for (const ver of ["pagantes", "ativas", "suspensas", "canceladas", "em-aberto", "sem-uso", "ia"]) {
      expect(html).toContain(`href="/plataforma?ver=${ver}#contas"`);
    }
    expect(html).toContain('href="/plataforma/pedidos?status=novo"');
    expect(html).toContain('href="/plataforma/suporte"');
  });

  it("o que não foi medido aparece como traço, não zero", () => {
    expect(html).toContain("não medido agora");
  });

  it("a tendência é SVG com descrição acessível", () => {
    expect(html).toContain("<polyline");
    expect(html).toContain("Contas novas nos últimos 6 meses: mai: 0, jun: 1, jul: 0, ago: 3, set: 1, out: 2");
    expect(html).toContain("7 em 6 meses");
  });
});

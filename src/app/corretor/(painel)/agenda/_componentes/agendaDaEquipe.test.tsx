import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

const { NumerosDoMes } = await import("./NumerosDoMes");
const { MesCompacto } = await import("./MesCompacto");

const zeros = { marcadas: 0, realizadas: 0, faltas: 0, semConfirmacao: 0, negocios: 0 };

describe("NumerosDoMes", () => {
  it("mês antes do começo diz 'não medido' em vez de zero", () => {
    const html = renderToStaticMarkup(
      <NumerosDoMes
        serie={[
          { medido: false, mes: "2026-09" },
          { medido: true, mes: "2026-10", ...zeros, marcadas: 5 },
        ]}
        medidaDesde="2026-10"
      />,
    );
    expect(html).toContain("não medido");
    expect(html).toContain("A Agenda começou a contar em outubro de 2026");
  });

  it("compara com o mês anterior medido", () => {
    const html = renderToStaticMarkup(
      <NumerosDoMes
        serie={[
          { medido: true, mes: "2026-10", ...zeros, marcadas: 4 },
          { medido: true, mes: "2026-11", ...zeros, marcadas: 6 },
        ]}
        medidaDesde="2026-10"
      />,
    );
    expect(html).toContain("+2 que out");
  });
});

describe("MesCompacto", () => {
  it("os links do mês preservam a visão da equipe e o filtro", () => {
    const html = renderToStaticMarkup(
      <MesCompacto
        mes="2026-11"
        diaSelecionado="2026-11-02"
        hoje="2026-11-02"
        marcadores={{}}
        consulta="&ver=equipe&corretor=c9"
      />,
    );
    expect(html).toContain('href="?mes=2026-10&amp;ver=equipe&amp;corretor=c9"');
    expect(html).toContain('href="?mes=2026-11&amp;dia=2026-11-03&amp;ver=equipe&amp;corretor=c9"');
  });
});

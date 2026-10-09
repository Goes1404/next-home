import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerMenuRecolhido } from "./_componentes/menuLateral";

/**
 * Guardas da lateral do computador (09/10/2026). As duas regressões que ela
 * pega falham caladas: o menu continua abrindo, só some o fim dele abaixo da
 * dobra, ou o botão de recolher deixa de ter onde gravar.
 */
const pasta = join(process.cwd(), "src/app/corretor/(painel)");
const nav = readFileSync(join(pasta, "NavPainel.tsx"), "utf8");
const layout = readFileSync(join(pasta, "layout.tsx"), "utf8");

describe("lateral do painel", () => {
  it("rola por dentro em vez de passar da dobra", () => {
    expect(nav).toMatch(/max-h-\[calc\(100svh-var\(--painel-header-h\)/);
    expect(nav).toMatch(/lateral-rolagem[^"]*overflow-y-auto/);
  });

  it("tem o botão de recolher e grava a escolha", () => {
    expect(nav).toContain("Recolher menu");
    expect(nav).toContain("Expandir menu");
    expect(nav).toContain("gravarMenuRecolhido(");
  });

  it("o layout lê o cookie e deixa a coluna seguir a largura da lateral", () => {
    expect(layout).toContain("lerMenuRecolhido(");
    expect(layout).toContain("md:grid-cols-[auto_minmax(0,1fr)]");
  });

  it("só 'recolhido' recolhe", () => {
    expect(lerMenuRecolhido("recolhido")).toBe(true);
    expect(lerMenuRecolhido("aberto")).toBe(false);
    expect(lerMenuRecolhido(undefined)).toBe(false);
  });
});

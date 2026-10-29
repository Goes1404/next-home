import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * O painel dentro do app Android (29/10/2026).
 *
 * O app da Play Store é um Trusted Web Activity e, no Android 15, a página é
 * desenhada por baixo da barra de status (em cima) e da barra de gestos (em
 * baixo). O relato foi "o app está cortando algumas partes": o cabeçalho
 * ficava atrás do relógio e o último botão das folhas que sobem de baixo,
 * atrás da barra de gestos. No navegador comum as áreas seguras valem 0, por
 * isso ninguém via.
 *
 * 1. `pb-safe` com outro `pb-*` na mesma classe: as duas escrevem
 *    `padding-bottom`, uma anula a outra. Use
 *    `pb-[calc(1.5rem+env(safe-area-inset-bottom))]`.
 * 2. O cabeçalho do painel e o da plataforma reservam a área do topo
 *    (`pt-safe`).
 */
const RAIZES = [path.join(process.cwd(), "src/app/corretor"), path.join(process.cwd(), "src/app/plataforma"), path.join(process.cwd(), "src/components")];

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

describe("área segura do app Android", () => {
  it("nenhuma classe junta pb-safe com outro pb- sem prefixo de tela", () => {
    const conflitos: string[] = [];
    for (const arq of RAIZES.flatMap(arquivos)) {
      const codigo = fs.readFileSync(arq, "utf8");
      for (const m of codigo.matchAll(/["'`]([^"'`]*\bpb-safe\b[^"'`]*)["'`]/g)) {
        const classes = m[1].split(/\s+/);
        if (classes.some((c) => /^pb-(?!safe$)/.test(c))) conflitos.push(`${path.relative(process.cwd(), arq)}: ${m[1].slice(0, 80)}`);
      }
    }
    expect(conflitos).toEqual([]);
  });

  it("o cabeçalho do painel e o da plataforma reservam a barra de status", () => {
    const painel = fs.readFileSync(path.join(process.cwd(), "src/app/corretor/(painel)/layout.tsx"), "utf8");
    expect(painel).toMatch(/<CabecalhoDoPainel className="[^"]*\bpt-safe\b/);
    expect(painel).toContain('className="faixa-de-status"');
    const plataforma = fs.readFileSync(path.join(process.cwd(), "src/app/plataforma/layout.tsx"), "utf8");
    expect(plataforma).toMatch(/<header className="[^"]*\bpt-safe\b/);
  });
});

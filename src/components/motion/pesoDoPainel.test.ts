import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de PESO: o que o painel não usa não entra no JavaScript dele.
 *
 * Duas regras, as duas nascidas da medição do manifesto do build em
 * 12/10/2026 (`node scripts/bundleTeto.mjs --detalhe`):
 *
 * 1. O layout raiz não importa `SmoothScroll` direto. Ele é montado por
 *    `MovimentoDoSite`, que só o carrega (por `next/dynamic`) fora de
 *    `/corretor`. Um `import` estático no layout devolve GSAP + ScrollTrigger
 *    + Lenis (~120 KB) a toda tela do painel.
 * 2. Fora de `src/lib/supabase/`, ninguém importa `lib/supabase/client`
 *    estaticamente. O cliente do navegador vem por `createClientSobDemanda`,
 *    no efeito ou no handler que precisa dele. Um `import` estático devolve
 *    o supabase-js (~245 KB) ao primeiro carregamento da rota.
 *
 * A regressão das duas é CALADA — build, tipos e testes passam, a tela abre
 * igual, só o quadro de rede engorda. Por isso a guarda lê o código.
 */
const RAIZ = join(__dirname, "..", "..");

function arquivosTs(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === "node_modules" || nome === ".next") continue;
      arquivosTs(caminho, acc);
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      acc.push(caminho);
    }
  }
  return acc;
}

/** Tira comentários antes de acusar — a lição de várias guardas desta base. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("peso do painel", () => {
  it("o layout raiz monta o movimento por MovimentoDoSite, não importa SmoothScroll direto", () => {
    const layout = semComentarios(readFileSync(join(RAIZ, "app", "layout.tsx"), "utf8"));
    expect(layout).toContain("MovimentoDoSite");
    expect(layout).not.toMatch(/from\s+["'][^"']*motion\/SmoothScroll["']/);
  });

  it("MovimentoDoSite carrega o SmoothScroll por import assíncrono e cala no painel", () => {
    const fonte = semComentarios(readFileSync(join(__dirname, "MovimentoDoSite.tsx"), "utf8"));
    expect(fonte).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/SmoothScroll["']\)/);
    // Por segmento, não por prefixo: `/corretores` é página pública.
    expect(fonte).toContain('caminho === "/corretor" || caminho.startsWith("/corretor/")');
  });

  it("ninguém fora de lib/supabase importa o cliente do navegador estaticamente", () => {
    const ofensores = arquivosTs(RAIZ)
      .filter((f) => !f.includes(join("lib", "supabase") + "/"))
      .filter((f) => /from\s+["']@\/lib\/supabase\/client["']/.test(semComentarios(readFileSync(f, "utf8"))))
      .map((f) => f.replace(RAIZ + "/", ""));
    expect(ofensores, "use createClientSobDemanda (lib/supabase/clientSobDemanda.ts)").toEqual([]);
  });

  it("clientSobDemanda carrega ./client por import()", () => {
    const fonte = semComentarios(readFileSync(join(RAIZ, "lib", "supabase", "clientSobDemanda.ts"), "utf8"));
    expect(fonte).toMatch(/await\s+import\(["']\.\/client["']\)/);
  });
});

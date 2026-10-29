import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { SCRIPT_DE_APP } from "./ComportamentoDeApp";

/**
 * O jeito de app (sem puxar para atualizar, sem zoom, sem menu de link) só
 * vale no app instalado. Roda o script de verdade contra um `window` falso.
 */
function rodar(app: boolean) {
  const atributos = new Map<string, string>();
  let viewport = "width=device-width, initial-scale=1, viewport-fit=cover";
  const ouvintes: string[] = [];
  const documento = {
    documentElement: { setAttribute: (k: string, v: string) => atributos.set(k, v) },
    querySelector: () => ({ setAttribute: (_k: string, v: string) => (viewport = v) }),
    addEventListener: (nome: string) => ouvintes.push(nome),
  };
  const janela = { matchMedia: (q: string) => ({ matches: q.includes("standalone") ? app : false }), addEventListener: () => {} };
  new Function("window", "document", "matchMedia", "navigator", SCRIPT_DE_APP)(janela, documento, janela.matchMedia, {});
  return { app: atributos.get("data-app") ?? null, viewport, ouvintes };
}

describe("comportamento de app", () => {
  it("no app instalado: marca data-app, trava o zoom e segura o menu de link", () => {
    const r = rodar(true);
    expect(r.app).toBe("sim");
    expect(r.viewport).toContain("user-scalable=no");
    expect(r.viewport).toContain("viewport-fit=cover");
    expect(r.ouvintes).toContain("contextmenu");
  });

  it("no navegador comum: nada muda", () => {
    const r = rodar(false);
    expect(r).toEqual({ app: null, viewport: "width=device-width, initial-scale=1, viewport-fit=cover", ouvintes: [] });
  });

  it("o CSS desliga o puxar-para-atualizar no rolador RAIZ (o <html>)", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/html\[data-app\]\s*\{[^}]*overscroll-behavior:\s*none/);
  });

  it("o service worker do painel mostra a página offline e não guarda páginas do CRM", () => {
    const sw = fs.readFileSync("public/sw-painel.js", "utf8");
    expect(sw).toContain('"/offline.html"');
    expect(sw).toContain('event.request.mode !== "navigate"');
    expect(sw).not.toMatch(/cache\.put|\.put\(/);
    expect(fs.existsSync("public/offline.html")).toBe(true);
  });
});

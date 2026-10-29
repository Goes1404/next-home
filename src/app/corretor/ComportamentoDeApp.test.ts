import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { COR_DA_BARRA_DO_ACESSO, COR_DA_BARRA_DO_PAINEL, SCRIPT_DA_BARRA, SCRIPT_DE_APP } from "./ComportamentoDeApp";

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

/** Roda o script da cor da barra contra um documento falso. */
function barra({ caminho, tema, corDaTela }: { caminho: string; tema: "claro" | "escuro"; corDaTela?: string }) {
  let cor = "#cfd9c2";
  const meta = { getAttribute: () => cor, setAttribute: (_k: string, v: string) => (cor = v) };
  const documento = {
    documentElement: { getAttribute: (k: string) => (k === "data-tema" ? tema : null) },
    head: {},
    body: {},
    readyState: "complete",
    querySelector: (sel: string) =>
      sel.includes("theme-color") ? meta : sel.includes("data-cor-da-barra") && corDaTela ? { getAttribute: () => corDaTela } : null,
    addEventListener: () => {},
  };
  class Observador {
    observe() {}
  }
  new Function("document", "location", "MutationObserver", "requestAnimationFrame", SCRIPT_DA_BARRA)(
    documento,
    { pathname: caminho },
    Observador,
    (f: () => void) => f(),
  );
  return cor;
}

describe("cor da barra de status (sem o verde da Next)", () => {
  it("no painel, a barra segue o fundo do painel em cada tema", () => {
    expect(barra({ caminho: "/corretor", tema: "claro" })).toBe(COR_DA_BARRA_DO_PAINEL.claro);
    expect(barra({ caminho: "/corretor/leads", tema: "escuro" })).toBe(COR_DA_BARRA_DO_PAINEL.escuro);
    expect(barra({ caminho: "/plataforma", tema: "claro" })).toBe(COR_DA_BARRA_DO_PAINEL.claro);
  });

  it("a tela que pede uma cor (o céu do login) ganha a dela", () => {
    expect(barra({ caminho: "/corretor/entrar", tema: "claro", corDaTela: COR_DA_BARRA_DO_ACESSO })).toBe("#08132a");
  });

  it("fora do painel não mexe (site público das imobiliárias)", () => {
    expect(barra({ caminho: "/corretores/fulano", tema: "claro" })).toBe("#cfd9c2");
  });
});

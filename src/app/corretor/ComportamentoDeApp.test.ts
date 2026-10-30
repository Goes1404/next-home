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
    // Só o véu da saída animada, que vale em qualquer navegador.
    expect(r).toEqual({ app: null, viewport: "width=device-width, initial-scale=1, viewport-fit=cover", ouvintes: ["submit"] });
  });

  it("o CSS desliga o puxar-para-atualizar no rolador RAIZ (o <html>)", () => {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/html\[data-app\]\s*\{[^}]*overscroll-behavior:\s*none/);
  });

  /*
   * Até 29/10/2026 esta guarda proibia qualquer `.put(` no worker. O offline
   * leve (segunda leva) passou a guardar a casca e os dados do app sem
   * internet — mudança consciente. O que continua proibido é guardar PÁGINA
   * do CRM: a navegação segue da rede, e sem rede vira `/offline.html`. O
   * comportamento do cache (caixa por usuário, nada de conversa) está em
   * `swPainel.test.ts`.
   */
  it("o service worker do painel mostra a página offline e não guarda páginas do CRM", () => {
    const sw = fs.readFileSync("public/sw-painel.js", "utf8");
    expect(sw).toContain('"/offline.html"');
    expect(sw).toContain('event.request.mode !== "navigate"');
    // Os dois únicos `put`: a casca e a caixa de dados do usuário.
    expect(sw.match(/\.put\(/g)?.length).toBe(2);
    expect(sw).toContain("caixa.put(ROTA_DOS_DADOS");
    expect(sw).toContain("caixa.put(pedido, resposta)");
    expect(fs.existsSync("public/offline.html")).toBe(true);
  });

  /*
   * Mudança consciente (30/10/2026): o "limpar-dados" ia só ao `controller`,
   * que é nulo no Início (`/corretor`, fora do escopo antigo `/corretor/`).
   * Agora vai também ao worker ATIVO de cada registro do painel.
   */
  it("sair da conta manda o service worker apagar os dados, mesmo sem controlador", async () => {
    const recebidas: string[] = [];
    const worker = (nome: string) => ({ postMessage: (m: { tipo: string }) => recebidas.push(`${nome}:${m.tipo}`) });
    let aoSair: ((e: unknown) => void) | null = null;
    const documento = {
      documentElement: { setAttribute: () => {} },
      querySelector: () => null,
      addEventListener: (nome: string, f: (e: unknown) => void) => {
        if (nome === "submit") aoSair = f;
      },
    };
    const navegador = {
      serviceWorker: {
        controller: null,
        getRegistrations: async () => [
          { scope: "https://x.app/corretor", active: worker("novo") },
          { scope: "https://x.app/corretor/", active: worker("antigo") },
          { scope: "https://x.app/outro/", active: worker("alheio") },
        ],
      },
    };
    const janela = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };
    new Function("window", "document", "matchMedia", "navigator", SCRIPT_DE_APP)(janela, documento, janela.matchMedia, navegador);
    aoSair!({ target: { hasAttribute: (k: string) => k === "data-sair" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(recebidas.sort()).toEqual(["antigo:limpar-dados", "novo:limpar-dados"]);
    expect(fs.readFileSync("src/app/corretor/LimparSaida.tsx", "utf8")).toContain('avisarServiceWorkers({ tipo: "limpar-dados" })');
  });

  it("o worker é registrado no escopo do start_url (/corretor), não em /corretor/", () => {
    expect(SCRIPT_DE_APP).toContain('{scope:"/corretor"}');
    expect(SCRIPT_DE_APP).not.toContain('scope:"/corretor/"');
    const manifesto = JSON.parse(fs.readFileSync("public/astro.webmanifest", "utf8"));
    expect(manifesto.start_url).toBe("/corretor");
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

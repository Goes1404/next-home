import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ROTA_DOS_DADOS_OFFLINE } from "@/lib/painel/dadosOffline";

/**
 * O `sw-painel.js` de verdade contra um `self`, um `caches` e um `fetch`
 * falsos (29/10/2026, offline leve). O que importa travar:
 *
 * - os dados do app sem internet ficam numa caixa POR USUÁRIO, e a de outro
 *   usuário some antes de guardar;
 * - 401 e o "limpar-dados" (sair / tela de login) apagam tudo;
 * - conversa, mensagem e outras APIs nunca são guardadas;
 * - as notificações seguem iguais.
 */
const FONTE = readFileSync("public/sw-painel.js", "utf8");
const ORIGEM = "https://astroimob.vercel.app";

type Caixa = Map<string, Response>;

function chave(r: string | { url: string }): string {
  const u = typeof r === "string" ? r : r.url;
  return new URL(u, ORIGEM).pathname + new URL(u, ORIGEM).search;
}

function carregar(opcoes: { origem?: string; rede?: (url: string) => Promise<Response> } = {}) {
  const origem = opcoes.origem ?? ORIGEM;
  const ouvintes: Record<string, (e: unknown) => void> = {};
  const armazem = new Map<string, Caixa>();
  const caches = {
    async open(nome: string) {
      if (!armazem.has(nome)) armazem.set(nome, new Map());
      const caixa = armazem.get(nome)!;
      return {
        async put(r: string | { url: string }, resp: Response) {
          caixa.set(chave(r), resp);
        },
        async match(r: string | { url: string }) {
          return caixa.get(chave(r))?.clone();
        },
        async keys() {
          return [...caixa.keys()].map((url) => ({ url }));
        },
        async delete(r: string | { url: string }) {
          return caixa.delete(chave(r));
        },
        async addAll() {},
      };
    },
    async keys() {
      return [...armazem.keys()];
    },
    async delete(nome: string) {
      return armazem.delete(nome);
    },
    async match(r: string | { url: string }) {
      for (const caixa of armazem.values()) {
        const achou = caixa.get(chave(r));
        if (achou) return achou.clone();
      }
      return undefined;
    },
  };
  const mostradas: unknown[] = [];
  const self = {
    location: { origin: origem },
    addEventListener: (nome: string, f: (e: unknown) => void) => (ouvintes[nome] = f),
    registration: { showNotification: (titulo: string, op: unknown) => (mostradas.push([titulo, op]), Promise.resolve()) },
    clients: { matchAll: async () => [], openWindow: async () => null, claim: async () => {} },
    skipWaiting: () => {},
  };
  const rede = vi.fn(opcoes.rede ?? (async () => new Response("ok")));
  const api = new Function(
    "self",
    "caches",
    "fetch",
    `${FONTE}\nreturn { caixaDoUsuario, caixasParaApagar, cachesVelhos, podeGuardar, usuarioDosDados, ROTA_DOS_DADOS, CACHE_CASCA };`,
  )(self, caches, (r: { url: string } | string) => rede(typeof r === "string" ? r : r.url)) as {
    caixaDoUsuario: (id: string) => string;
    caixasParaApagar: (nomes: string[], id: string | null) => string[];
    cachesVelhos: (nomes: string[]) => string[];
    podeGuardar: (url: string, origem: string) => "dados" | "casca" | null;
    usuarioDosDados: (corpo: unknown) => string | null;
    ROTA_DOS_DADOS: string;
    CACHE_CASCA: string;
  };

  /** Dispara um fetch como o navegador faria; `null` se o worker não respondeu. */
  async function pedir(url: string, modo = "cors"): Promise<Response | null> {
    let resposta: Promise<Response> | null = null;
    const esperas: Promise<unknown>[] = [];
    ouvintes.fetch({
      request: { url: new URL(url, origem).href, method: "GET", mode: modo },
      respondWith: (p: Promise<Response>) => (resposta = p),
      waitUntil: (p: Promise<unknown>) => esperas.push(p),
      preloadResponse: Promise.resolve(undefined),
    });
    const r = resposta ? await resposta : null;
    await Promise.all(esperas);
    return r;
  }

  async function mensagem(dados: unknown) {
    const esperas: Promise<unknown>[] = [];
    ouvintes.message({ data: dados, waitUntil: (p: Promise<unknown>) => esperas.push(p) });
    await Promise.all(esperas);
  }

  return { api, armazem, ouvintes, rede, pedir, mensagem, mostradas };
}

const dadosDe = (usuarioId: string) =>
  new Response(JSON.stringify({ versao: 1, usuarioId, geradoEm: "2026-10-29T12:00:00Z", dia: "2026-10-29", agenda: [], leads: [{ nome: `lead de ${usuarioId}` }] }), {
    headers: { "Content-Type": "application/json" },
  });

describe("sw-painel.js: funções puras", () => {
  const { api } = carregar();

  it("a rota que ele guarda é a mesma que o app pede", () => {
    expect(api.ROTA_DOS_DADOS).toBe(ROTA_DOS_DADOS_OFFLINE);
  });

  it("uma caixa por usuário, e só a dele sobra", () => {
    const a = api.caixaDoUsuario("aaa");
    const b = api.caixaDoUsuario("bbb");
    expect(a).not.toBe(b);
    expect(api.caixasParaApagar([a, b, api.CACHE_CASCA, "outra-coisa"], "aaa")).toEqual([b]);
    // Sem usuário (sair, 401): todas as de dados, nada da casca.
    expect(api.caixasParaApagar([a, b, api.CACHE_CASCA, "astro-dados-v1:velho"], null)).toEqual([a, b, "astro-dados-v1:velho"]);
  });

  it("na ativação some o cache antigo (v1) e versões velhas de dados; fica a casca atual", () => {
    const atual = api.caixaDoUsuario("aaa");
    expect(api.cachesVelhos(["astro-offline-v1", "astro-casca-v1", api.CACHE_CASCA, "astro-dados-v1:x", atual, "de-outro-site"]).sort()).toEqual(
      ["astro-casca-v1", "astro-dados-v1:x", "astro-offline-v1"].sort(),
    );
  });

  it("nunca guarda conversa, mensagem, outra API ou página", () => {
    for (const url of [
      "/api/painel/busca?q=ana",
      "/api/painel/contadores",
      "/api/whatsapp/conversas",
      "/corretor/conversas?c=1",
      "/api/painel/offline?outro=1",
      "/corretor/leads",
      "https://outro.com/api/painel/offline",
      "/_next/static/chunks/conversa-abc.js",
    ]) {
      expect(api.podeGuardar(url, ORIGEM), url).toBeNull();
    }
    expect(api.podeGuardar("/api/painel/offline", ORIGEM)).toBe("dados");
    expect(api.podeGuardar("/_next/static/chunks/app-123.js", ORIGEM)).toBe("casca");
    expect(api.podeGuardar("/icones/astroimob-192.png", ORIGEM)).toBe("casca");
    expect(api.podeGuardar("/offline.html", ORIGEM)).toBe("casca");
    // No `next dev` o nome do arquivo não muda com o conteúdo.
    expect(api.podeGuardar("http://localhost:3000/_next/static/chunks/app.js", "http://localhost:3000")).toBeNull();
  });

  it("só aceita o corpo no formato combinado", () => {
    expect(api.usuarioDosDados({ versao: 1, usuarioId: "u1" })).toBe("u1");
    expect(api.usuarioDosDados({ versao: 2, usuarioId: "u1" })).toBeNull();
    expect(api.usuarioDosDados({ versao: 1 })).toBeNull();
    expect(api.usuarioDosDados(null)).toBeNull();
  });
});

describe("sw-painel.js: dados do app sem internet", () => {
  it("guarda na caixa do usuário e apaga a do anterior quando a sessão troca", async () => {
    let quem = "usuario-a";
    const sw = carregar({ rede: async () => dadosDe(quem) });
    await sw.pedir(ROTA_DOS_DADOS_OFFLINE);
    expect([...sw.armazem.keys()]).toEqual([sw.api.caixaDoUsuario("usuario-a")]);

    quem = "usuario-b";
    await sw.pedir(ROTA_DOS_DADOS_OFFLINE);
    expect([...sw.armazem.keys()]).toEqual([sw.api.caixaDoUsuario("usuario-b")]);
  });

  it("sem rede, devolve o último guardado; sem nada guardado, 503", async () => {
    let online = true;
    const sw = carregar({
      rede: async () => {
        if (!online) throw new TypeError("Failed to fetch");
        return dadosDe("usuario-a");
      },
    });
    online = false;
    expect((await sw.pedir(ROTA_DOS_DADOS_OFFLINE))?.status).toBe(503);
    online = true;
    await sw.pedir(ROTA_DOS_DADOS_OFFLINE);
    online = false;
    const r = await sw.pedir(ROTA_DOS_DADOS_OFFLINE);
    expect(await r?.json()).toMatchObject({ usuarioId: "usuario-a" });
  });

  it("401 (sessão acabou) apaga tudo", async () => {
    let status = 200;
    const sw = carregar({ rede: async () => (status === 200 ? dadosDe("usuario-a") : new Response(null, { status })) });
    await sw.pedir(ROTA_DOS_DADOS_OFFLINE);
    status = 401;
    await sw.pedir(ROTA_DOS_DADOS_OFFLINE);
    expect([...sw.armazem.keys()].filter((n) => n.startsWith("astro-dados-"))).toEqual([]);
  });

  it("sair da conta (limpar-dados) apaga; a mensagem de sessão apaga só a dos outros", async () => {
    let quem = "usuario-a";
    const sw = carregar({ rede: async () => dadosDe(quem) });
    await sw.pedir(ROTA_DOS_DADOS_OFFLINE);
    await sw.mensagem({ tipo: "sessao", usuarioId: "usuario-a" });
    expect(sw.armazem.has(sw.api.caixaDoUsuario("usuario-a"))).toBe(true);
    await sw.mensagem({ tipo: "sessao", usuarioId: "usuario-b" });
    expect(sw.armazem.has(sw.api.caixaDoUsuario("usuario-a"))).toBe(false);

    quem = "usuario-c";
    await sw.pedir(ROTA_DOS_DADOS_OFFLINE);
    await sw.mensagem({ tipo: "limpar-dados" });
    expect([...sw.armazem.keys()].filter((n) => n.startsWith("astro-dados-"))).toEqual([]);
  });

  it("conversa e busca passam direto, sem cache", async () => {
    const sw = carregar({ rede: async () => new Response("[]") });
    expect(await sw.pedir("/api/painel/busca?q=ana")).toBeNull();
    expect(await sw.pedir("/corretor/conversas?c=1", "cors")).toBeNull();
    expect([...sw.armazem.keys()]).toEqual([]);
  });

  it("casca: guarda o arquivo estático e serve do cache na segunda vez", async () => {
    const sw = carregar({ rede: async () => Object.defineProperty(new Response("js"), "type", { value: "basic" }) });
    await sw.pedir("/_next/static/chunks/app-1.js");
    await sw.pedir("/_next/static/chunks/app-1.js");
    expect(sw.rede).toHaveBeenCalledTimes(1);
    expect(sw.armazem.get(sw.api.CACHE_CASCA)?.has("/_next/static/chunks/app-1.js")).toBe(true);
  });
});

describe("sw-painel.js: notificações sem mudança", () => {
  it("push mostra a notificação com os mesmos campos de antes", async () => {
    const sw = carregar();
    const esperas: Promise<unknown>[] = [];
    sw.ouvintes.push({
      data: { json: () => ({ titulo: "Novo lead", corpo: "Ana", tag: "lead-1", url: "/corretor/leads/1" }) },
      waitUntil: (p: Promise<unknown>) => esperas.push(p),
    });
    await Promise.all(esperas);
    expect(sw.mostradas).toEqual([
      [
        "Novo lead",
        { body: "Ana", tag: "lead-1", renotify: true, icon: "/icon.png", badge: "/icon.png", data: { url: "/corretor/leads/1" } },
      ],
    ]);
  });
});

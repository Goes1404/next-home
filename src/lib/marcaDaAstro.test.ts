import { describe, expect, it } from "vitest";
import { ROTAS_DE_TOKEN_DO_CLIENTE } from "@/lib/enderecosDoPainel";
import { ehDocumentoDaAstro, scriptDaMarcaDaAstro } from "@/lib/marcaDaAstro";

describe("ehDocumentoDaAstro", () => {
  it("painel, plataforma, acesso, vendas e ajuda são da Astro em qualquer endereço", () => {
    for (const c of ["/corretor", "/corretor/leads", "/corretor/entrar", "/plataforma/grupos/x", "/astro", "/ajuda/x", "/auth/confirmar"]) {
      expect(ehDocumentoDaAstro(c, false)).toBe(true);
    }
  });
  it("o site da imobiliária fica com a marca dela", () => {
    expect(ehDocumentoDaAstro("/", false)).toBe(false);
    expect(ehDocumentoDaAstro("/imoveis", false)).toBe(false);
    expect(ehDocumentoDaAstro("/corretores", false)).toBe(false);
  });
  it("no endereço do painel tudo é da Astro, menos o link de token do cliente", () => {
    expect(ehDocumentoDaAstro("/", true)).toBe(true);
    expect(ehDocumentoDaAstro("/qualquer", true)).toBe(true);
    expect(ehDocumentoDaAstro("/selecao/abc", true)).toBe(false);
    expect(ehDocumentoDaAstro("/v/abc", true)).toBe(false);
  });
});

describe("scriptDaMarcaDaAstro", () => {
  function rodar(host: string, caminho: string) {
    const atributos: Record<string, string> = {};
    const meta = { content: "#cfd9c2", setAttribute: (_: string, v: string) => (meta.content = v) };
    const documento = {
      documentElement: { setAttribute: (n: string, v: string) => (atributos[n] = v) },
      querySelector: () => meta,
    };
    new Function("document", "location", scriptDaMarcaDaAstro(["astroimob.vercel.app"], ROTAS_DE_TOKEN_DO_CLIENTE))(documento, {
      hostname: host,
      pathname: caminho,
    });
    return { marcado: "data-documento-astro" in atributos, barra: meta.content };
  }
  it("marca o painel e pinta a barra de marinho", () => {
    expect(rodar("www.nexthomeimoveis.com", "/corretor/leads")).toEqual({ marcado: true, barra: "#0f2547" });
    expect(rodar("astroimob.vercel.app", "/")).toEqual({ marcado: true, barra: "#0f2547" });
  });
  it("não toca no site nem no link do cliente", () => {
    expect(rodar("www.nexthomeimoveis.com", "/")).toEqual({ marcado: false, barra: "#cfd9c2" });
    expect(rodar("astroimob.vercel.app", "/selecao/abc")).toEqual({ marcado: false, barra: "#cfd9c2" });
  });
});

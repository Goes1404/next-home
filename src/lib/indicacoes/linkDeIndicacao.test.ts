import { describe, expect, it, vi } from "vitest";
import {
  codigoQueVale,
  COOKIE_DE_INDICACAO,
  linkDeIndicacao,
  linkDoWhatsAppDeIndicacao,
  mensagemDeIndicacao,
  normalizarCodigoDeIndicacao,
} from "./codigo";

/**
 * O caminho do link do "indique e ganhe" até o cookie (0247, 29/10/2026):
 * `/i/<codigo>` e `?indicacao=<codigo>` gravam `astro_indicacao` por 30
 * dias, sem consultar o banco, e as duas portas ficam fora do site das
 * imobiliárias (o proxy não as reescreve para `/s/<host>/...`).
 */

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: null }) } }),
}));

const { proxy } = await import("@/proxy");
const { GET } = await import("@/app/i/[codigo]/route");
const { NextRequest } = await import("next/server");

const BASE = "https://astroimob.vercel.app";

describe("o código de indicação", () => {
  it("aceita minúsculas e dígitos (6 a 32), limpando espaço e maiúscula", () => {
    expect(normalizarCodigoDeIndicacao("a1b2c3d4")).toBe("a1b2c3d4");
    expect(normalizarCodigoDeIndicacao("  A1B2C3D4 ")).toBe("a1b2c3d4");
    for (const ruim of ["abc", "a1b2-c3d4", "a1b2c3d4'; drop", "", null, 42, "x".repeat(33)]) {
      expect(normalizarCodigoDeIndicacao(ruim)).toBeNull();
    }
  });

  it("o do endereço vence o do cookie; inválido não vale", () => {
    expect(codigoQueVale("novo1234", "velho123")).toBe("novo1234");
    expect(codigoQueVale("??", "velho123")).toBe("velho123");
    expect(codigoQueVale(undefined, undefined)).toBeNull();
  });

  it("monta o link curto e a mensagem neutra do WhatsApp (serve a qualquer ramo)", () => {
    const link = linkDeIndicacao("a1b2c3d4", `${BASE}/`);
    expect(link).toBe(`${BASE}/i/a1b2c3d4`);
    const texto = mensagemDeIndicacao("Silva Seguros", link);
    expect(texto).toContain(link);
    expect(texto).toContain("Silva Seguros");
    expect(texto.toLowerCase()).not.toMatch(/imóve|imobili|corretor/);
    expect(linkDoWhatsAppDeIndicacao(texto)).toBe(`https://wa.me/?text=${encodeURIComponent(texto)}`);
  });
});

describe("/i/<codigo>", () => {
  async function abrir(codigo: string) {
    return GET(new Request(`${BASE}/i/${codigo}`), { params: Promise.resolve({ codigo }) });
  }

  it("grava o cookie de 30 dias e leva aos planos da página de vendas", async () => {
    const r = await abrir("A1B2C3D4");
    expect(new URL(r.headers.get("location")!).pathname + new URL(r.headers.get("location")!).hash).toBe("/astro#planos");
    const cookie = r.cookies.get(COOKIE_DE_INDICACAO);
    expect(cookie?.value).toBe("a1b2c3d4");
    expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60);
    expect(cookie?.httpOnly).toBe(true);
    expect(r.headers.get("cache-control")).toContain("no-store");
  });

  it("código torto não vira cookie, mas a pessoa chega à página do mesmo jeito", async () => {
    const r = await abrir("%E0%A4%A");
    expect(r.cookies.get(COOKIE_DE_INDICACAO)).toBeUndefined();
    expect(r.headers.get("location")).toContain("/astro");
  });
});

describe("o proxy e a indicação", () => {
  it("?indicacao= numa página da Astro vira o mesmo cookie", async () => {
    const r = await proxy(new NextRequest(new URL("/astro/contratar?indicacao=a1b2c3d4", BASE)));
    expect(r.cookies.get(COOKIE_DE_INDICACAO)?.value).toBe("a1b2c3d4");
  });

  it("na raiz do endereço do CRM (que é a página de vendas), ?indicacao= também vale", async () => {
    const r = await proxy(
      new NextRequest(new URL("/?indicacao=a1b2c3d4", BASE), { headers: { host: "astroimob.vercel.app" } }),
    );
    expect(r.headers.get("x-middleware-rewrite")).toContain("/astro");
    expect(r.cookies.get(COOKIE_DE_INDICACAO)?.value).toBe("a1b2c3d4");
  });

  it("?indicacao= inválido não grava nada", async () => {
    const r = await proxy(new NextRequest(new URL("/astro/contratar?indicacao=x", BASE)));
    expect(r.cookies.get(COOKIE_DE_INDICACAO)).toBeUndefined();
  });

  it("/i e /ajuda não são páginas do site de uma imobiliária (sem reescrita para /s/<host>)", async () => {
    for (const caminho of ["/i/a1b2c3d4", "/ajuda", "/ajuda/conectar-o-whatsapp"]) {
      const r = await proxy(new NextRequest(new URL(caminho, "https://imobsol.com.br")));
      expect(r.headers.get("x-middleware-rewrite"), caminho).toBeNull();
      expect(r.headers.get("location"), caminho).toBeNull();
    }
  });
});

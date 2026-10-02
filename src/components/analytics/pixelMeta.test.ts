import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cliqueDeWhatsapp,
  idDoPixelValido,
  imovelDaPagina,
  paginaRastreavel,
} from "./pixelMeta";

const ORIGEM = "https://next-home-drab.vercel.app";

describe("paginaRastreavel", () => {
  it("rastreia o site público", () => {
    expect(paginaRastreavel("/")).toBe(true);
    expect(paginaRastreavel("/empreendimentos/terra-alta-ta141")).toBe(true);
    expect(paginaRastreavel("/financiamento")).toBe(true);
  });

  it("deixa de fora páginas de token, painel e o atalho /wa", () => {
    for (const p of [
      "/portal/abc",
      "/selecao/abc",
      "/proposta/abc",
      "/documentos/abc",
      "/parceiro/abc",
      "/corretor",
      "/corretor/leads",
      "/wa",
      "/wa/terra-alta-ta141",
    ]) {
      expect(paginaRastreavel(p), p).toBe(false);
    }
  });

  it("não confunde prefixo de texto com segmento", () => {
    expect(paginaRastreavel("/corretores")).toBe(true);
    expect(paginaRastreavel("/portalzinho")).toBe(true);
  });
});

describe("imovelDaPagina", () => {
  it("pega o slug da ficha e só da ficha", () => {
    expect(imovelDaPagina("/empreendimentos/terra-alta-ta141")).toBe("terra-alta-ta141");
    expect(imovelDaPagina("/empreendimentos")).toBeNull();
    expect(imovelDaPagina("/empreendimentos/a/b")).toBeNull();
  });
});

describe("cliqueDeWhatsapp", () => {
  it("reconhece o atalho com e sem imóvel", () => {
    expect(cliqueDeWhatsapp("/wa/terra-alta-ta141?m=oi", ORIGEM)).toEqual({ imovel: "terra-alta-ta141" });
    expect(cliqueDeWhatsapp("/wa", ORIGEM)).toEqual({ imovel: null });
    expect(cliqueDeWhatsapp(`${ORIGEM}/wa/x`, ORIGEM)).toEqual({ imovel: "x" });
  });

  it("reconhece o link direto do WhatsApp", () => {
    expect(cliqueDeWhatsapp("https://wa.me/5511999999999?text=oi", ORIGEM)).toEqual({ imovel: null });
    expect(cliqueDeWhatsapp("https://api.whatsapp.com/send?phone=55", ORIGEM)).toEqual({ imovel: null });
  });

  it("ignora o resto", () => {
    expect(cliqueDeWhatsapp("/empreendimentos", ORIGEM)).toBeNull();
    expect(cliqueDeWhatsapp("/wallet", ORIGEM)).toBeNull();
    expect(cliqueDeWhatsapp("https://outro.com/wa/x", ORIGEM)).toBeNull();
    expect(cliqueDeWhatsapp("mailto:a@b.com", ORIGEM)).toBeNull();
  });
});

describe("idDoPixelValido", () => {
  it("aceita só dígitos", () => {
    expect(idDoPixelValido(" 1467833562146196 ")).toBe("1467833562146196");
    expect(idDoPixelValido(undefined)).toBeNull();
    expect(idDoPixelValido("abc")).toBeNull();
  });
});

describe("guardas do componente", () => {
  const fonte = readFileSync(join(__dirname, "PixelMeta.tsx"), "utf8");

  it("desliga o PageView automático e os eventos automáticos da Meta", () => {
    // Sem isso, a Meta dispara PageView sozinha nas páginas de token e o
    // token vai junto no endereço.
    expect(fonte).toMatch(/fbq\.disablePushState = true/);
    expect(fonte).toMatch(/"set", "autoConfig", false/);
  });

  it("só o site público monta o pixel", () => {
    const raiz = readFileSync(join(__dirname, "../../app/layout.tsx"), "utf8");
    expect(raiz).not.toMatch(/PixelMeta/);
    for (const g of ["(institucional)", "(vitrine)"]) {
      const layout = readFileSync(join(__dirname, `../../app/${g}/layout.tsx`), "utf8");
      expect(layout, g).toMatch(/<PixelMeta \/>/);
    }
  });
});

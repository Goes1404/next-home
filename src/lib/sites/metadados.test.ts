import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import { marcaDoGrupo } from "./marca";
import { OG_IMAGEM } from "@/lib/dadosEstruturados";
import { metadata as metadadosDo404 } from "@/app/not-found";
import { ICONES_DA_NEXT_HOME, ICONES_NEUTROS, METADADOS_DO_RAIZ, metadadosDoSite, metadadosSemSite } from "./metadados";

const casa = marcaDoGrupo({ grupoId: GRUPO_NEXT_HOME_ID, nome: "Next Home", url: site.url });
const outro = marcaDoGrupo({ grupoId: "44444444-4444-4444-4444-444444444444", nome: "Casa Azul", url: "https://casaazul.com.br" });

describe("metadadosDoSite", () => {
  it("o site de outro grupo tem base, título e Open Graph próprios, sem nada da Next Home", () => {
    const m = metadadosDoSite(outro);
    expect(String(m.metadataBase)).toBe("https://casaazul.com.br/");
    expect(m.title).toEqual({ default: "Casa Azul", template: "%s · Casa Azul" });
    expect(m.other).toBeUndefined();
    const texto = JSON.stringify(m).toLowerCase();
    for (const proibido of ["next home", "nexthome", "alphaville", "og-image"]) expect(texto).not.toContain(proibido);
  });

  it("a Next Home mantém o que o layout raiz dizia, com as etiquetas geo", () => {
    const m = metadadosDoSite(casa);
    expect(String(m.metadataBase)).toBe(new URL(site.url).toString());
    expect(m.title).toEqual({
      default: `${site.nomeCompleto} — Imobiliária em Alphaville e Barueri`,
      template: `%s · ${site.nome}`,
    });
    expect(m.other).toMatchObject({ "geo.region": "BR-SP" });
  });

  it("as etiquetas geo saíram do layout raiz (o other é mesclado entre layouts)", () => {
    const raiz = readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
    expect(raiz).not.toMatch(/geo\.placename|geo\.position|ICBM/);
  });

  it("o site de outro grupo troca o ícone e o manifesto da Next Home (arquivos do raiz) pelos neutros", () => {
    const m = metadadosDoSite(outro);
    expect(m.icons).toEqual(ICONES_NEUTROS);
    expect(m).toHaveProperty("manifest", null);
    // A Next Home declara os dela (o favicon saiu de src/app) e mantém o manifesto.
    const c = metadadosDoSite(casa);
    expect(c.icons).toEqual(ICONES_DA_NEXT_HOME);
    expect(c).not.toHaveProperty("manifest");
  });

  it("nenhum favicon de arquivo em src/app: o Next o poria no head de todo endereço", () => {
    expect(existsSync(join(process.cwd(), "src", "app", "favicon.ico"))).toBe(false);
    expect(existsSync(join(process.cwd(), "public", "favicon.ico"))).toBe(true);
    for (const i of [...ICONES_DA_NEXT_HOME.icon, ...ICONES_DA_NEXT_HOME.apple]) {
      const arquivo = i.url.replace(/^\//, "");
      expect(existsSync(join(process.cwd(), "public", arquivo)) || existsSync(join(process.cwd(), "src", "app", arquivo)), i.url).toBe(true);
    }
  });
});

/**
 * O endereço de nenhum grupo: o raiz, o layout do site (sem site) e o 404,
 * mesclados como o Next mescla — cada chave do segmento de baixo substitui a
 * de cima. Antes da correção, a descrição, o Open Graph (com a imagem), o
 * Twitter, as palavras-chave e os autores da Next Home vinham do raiz para a
 * prévia de qualquer domínio apontado para a Vercel sem cadastro.
 */
describe("metadados do endereço de nenhum grupo", () => {
  const resolvido = { ...METADADOS_DO_RAIZ, ...metadadosSemSite(), ...metadadosDo404 };

  it("nada da Next Home: nome, descrição, imagem, endereço", () => {
    const texto = JSON.stringify(resolvido).toLowerCase();
    for (const proibido of ["next home", "nexthome", "alphaville", OG_IMAGEM.url.toLowerCase(), site.descricao.toLowerCase()]) {
      expect(texto, proibido).not.toContain(proibido);
    }
    expect(resolvido).not.toHaveProperty("openGraph");
    expect(resolvido).not.toHaveProperty("twitter");
    expect(resolvido).not.toHaveProperty("description");
  });

  it("ícone neutro, sem manifesto e fora do índice", () => {
    expect(resolvido.icons).toEqual(ICONES_NEUTROS);
    expect(resolvido.manifest).toBeNull();
    expect(resolvido.robots).toEqual({ index: false, follow: false });
    expect(resolvido.title).toEqual({ absolute: "Página não encontrada" });
  });

  it("o raiz não carrega descrição, imagem nem autor de ninguém", () => {
    for (const chave of ["description", "keywords", "openGraph", "twitter", "authors", "creator", "publisher", "applicationName", "icons", "manifest"]) {
      expect(METADADOS_DO_RAIZ, chave).not.toHaveProperty(chave);
    }
  });
});

import { site } from "./site";
import { describe, expect, it } from "vitest";
import {
  LIMITE_DESCRICAO,
  LIMITE_TITULO,
  LIMITE_TITULO_PAGINA,
  descricaoDePagina,
  limitar,
  tituloDePagina,
} from "./seo";

describe("régua de SERP", () => {
  it("o limite do título já desconta o sufixo da marca", () => {
    // O erro que gerou este arquivo: escrever 55 achando que cabe em 60 e
    // publicar 67, porque o template acrescenta " · Next Home".
    expect(LIMITE_TITULO_PAGINA).toBe(LIMITE_TITULO - " · Next Home".length);
  });

  it("não corta palavra ao meio", () => {
    const t = limitar("Apartamentos e casas em condomínio em Alphaville Barueri", 30);
    expect(t.length).toBeLessThanOrEqual(30);
    expect(t.endsWith(" ")).toBe(false);
    expect("Apartamentos e casas em condomínio em Alphaville Barueri").toContain(t);
  });

  it("não acrescenta reticências — o corte visual é do Google", () => {
    expect(limitar("a".repeat(200), 50)).not.toContain("…");
  });

  it("não deixa pontuação órfã no fim", () => {
    expect(limitar("Terra Alta — Jardim Tupanci, Barueri", 14)).toBe("Terra Alta");
  });

  it("texto que já cabe passa intacto", () => {
    expect(tituloDePagina("Fale com a Next Home")).toBe("Fale com a Next Home");
    expect(descricaoDePagina("Curta.")).toBe("Curta.");
  });

  it("normaliza espaço em texto vindo do banco", () => {
    // Tagline de empreendimento costuma vir com quebra de linha da planilha.
    expect(limitar("Viva  além\n do seu tempo.", 100)).toBe("Viva além do seu tempo.");
  });

  it("palavra única gigante corta seco em vez de sumir", () => {
    expect(limitar("Superlongapalavrasemespaço", 10)).toHaveLength(10);
  });

  it("os limites são os do Google", () => {
    expect(LIMITE_TITULO).toBe(60);
    expect(LIMITE_DESCRICAO).toBe(155);
  });
});

import { readFileSync } from "node:fs";

/**
 * Guarda de leitura de código: título literal de página pública tem de
 * caber SEM depender da função de corte.
 *
 * Em 27/08/2026 as nove páginas públicas estavam fora da régua ao mesmo
 * tempo — não foi descuido de uma, foi ausência de régua. E a regressão é
 * calada: o build passa, a página abre, e o estrago só aparece no resultado
 * de busca, onde ninguém do time olha.
 *
 * Só literais são conferidos. Título montado com dado do banco passa pela
 * `tituloDePagina`, que já corta — ali o tamanho não está sob controle de
 * quem escreve o código.
 */
const PAGINAS_PUBLICAS = [
  "src/app/s/[site]/(institucional)/page.tsx",
  "src/app/s/[site]/(institucional)/anunciar-imovel/page.tsx",
  "src/app/s/[site]/(institucional)/corretores/page.tsx",
  "src/app/s/[site]/(vitrine)/empreendimentos/page.tsx",
  "src/app/s/[site]/(vitrine)/mapa/page.tsx",
  "src/app/s/[site]/(institucional)/sobre/page.tsx",
  "src/app/s/[site]/(institucional)/contato/page.tsx",
  "src/app/s/[site]/(institucional)/privacidade/page.tsx",
  "src/app/s/[site]/(institucional)/financiamento/page.tsx",
];

describe("os títulos escritos à mão cabem na SERP", () => {
  for (const arquivo of PAGINAS_PUBLICAS) {
    it(`${arquivo.replace("src/app/", "")} cabe em ${LIMITE_TITULO_PAGINA} caracteres`, () => {
      const codigo = readFileSync(arquivo, "utf8");
      // Só o `title:` do bloco de metadata (no topo do objeto `metadata`, ou
      // no `return` de `generateMetadata`, desde a fase 3): string literal ou
      // template que só interpola a marca (`${site.nome}`, ou a do site,
      // `${marca.nome}`), medido com o nome desta instalação — um cliente de
      // nome longo estoura antes.
      const literais = [...codigo.matchAll(/^(?: {2}| {4})title: (?:"([^"]+)"|`([^`]+)`)/gm)]
        .map(
          (m) =>
            m[1] ??
            m[2]
              .replaceAll("${site.nome}", site.nome)
              .replaceAll("${site.nomeCompleto}", site.nomeCompleto)
              .replaceAll("${marca.nome}", site.nome)
              .replaceAll("${marca.nomeCompleto}", site.nomeCompleto),
        )
        .filter((t) => !t.includes("${"));
      expect(literais.length).toBeGreaterThan(0);

      for (const titulo of literais) {
        expect(
          titulo.length,
          `"${titulo}" tem ${titulo.length}; com " · Next Home" vira ${titulo.length + 12} e o Google corta em ${LIMITE_TITULO}`,
        ).toBeLessThanOrEqual(LIMITE_TITULO_PAGINA);
      }
    });
  }
});

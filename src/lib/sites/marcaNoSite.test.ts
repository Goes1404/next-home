import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/lib/grupos/codigoFonte";

/**
 * Guarda da fase 3 (20/10/2026): o site público usa a marca do SITE servido,
 * nunca o `site` fixo da Next Home.
 *
 * A regressão é calada e cara: um `site.creci` ou `site.endereco` novo numa
 * página pública funciona perfeitamente no site da Next Home — e no site de
 * outro grupo mostra o CRECI, o endereço e os telefones dela. Build, tipos e
 * a tela do site da Next Home ficam iguais. Por isso a guarda lê o código.
 */

const PUBLICO = "src/app/s/[site]";
const COMPONENTES = "src/components";

/** Quem ainda importa `site` no site público, com o motivo. */
const EXCECOES: Record<string, string> = {
  "src/app/s/[site]/layout.tsx": "o endereço canônico da Next Home, prerenderizado no build",
  "src/app/s/[site]/(institucional)/parceiro/[token]/acoes.ts":
    "link do PAINEL no aviso ao corretor; painel por grupo é a lacuna L46",
  "src/components/ui/Wordmark.tsx": "padrão para o painel; o site passa a marca do site em `nomes`",
};

const IMPORTA_SITE = /import\s*\{[^}]*\bsite\b[^}]*\}\s*from\s*"@\/lib\/site"/;

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(p.replaceAll("\\", "/"));
  }
  return saida;
}

function ler(caminho: string): string {
  return semComentarios(readFileSync(caminho, "utf8"));
}

describe("guarda: o site público usa a marca do site servido", () => {
  it("nenhuma página pública nem componente importa o `site` da Next Home fora das exceções", () => {
    const todos = [...arquivos(PUBLICO), ...arquivos(COMPONENTES)];
    expect(todos.length).toBeGreaterThan(100);
    const fora = todos.filter((a) => IMPORTA_SITE.test(ler(a)) && !(a in EXCECOES));
    expect(fora).toEqual([]);
    // Exceção que deixou de existir sai da lista.
    for (const a of Object.keys(EXCECOES)) expect(IMPORTA_SITE.test(ler(a)), a).toBe(true);
  });

  it("os layouts públicos ligam Pixel e vinheta pelo grupo do endereço", () => {
    for (const g of ["(institucional)", "(vitrine)"]) {
      const layout = ler(`${PUBLICO}/${g}/layout.tsx`);
      expect(layout, g).toMatch(/siteDaPagina\(params\)/);
      expect(layout, g).toMatch(/integracaoLiberada\(site\.grupoId, "pixel"\) && <PixelMeta \/>/);
      expect(layout, g).toMatch(/(ehNextHome|site\.marca\.ehNextHome) && <Preloader \/>/);
    }
  });

  it("o rodapé é do site, não do layout raiz", () => {
    expect(ler("src/app/layout.tsx")).not.toMatch(/<Footer\b/);
    expect(ler(`${PUBLICO}/layout.tsx`)).toMatch(/<Footer marca=\{site\.marca\} \/>/);
  });
});

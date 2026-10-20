import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * O cache de rota do site público mora no caminho de DESTINO (fase 3).
 *
 * O `proxy.ts` reescreve `/empreendimentos/x` para `/s/<host>/empreendimentos/x`,
 * e `revalidatePath` acha a entrada pelo arquivo que renderiza, não pelo
 * endereço da barra (doc do Next 16, "Using revalidatePath with rewrites").
 * Antes desta guarda, as actions chamavam `revalidatePath("/empreendimentos/x")`
 * — que não acha rota nenhuma —, e o corretor salvava o preço, abria a ficha
 * e via o preço antigo. A regressão é calada: a chamada existe, só não age.
 */

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath }));

const RAIZ = join(__dirname, "..", "..", "..");
const APP = join(RAIZ, "src", "app");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

/** Caminhos que não passam pelo proxy do site: o painel e a plataforma. */
function caminhoPermitido(caminho: string, tipo: string | undefined): boolean {
  if (caminho === "/corretor" || caminho.startsWith("/corretor/")) return true;
  if (caminho === "/plataforma" || caminho.startsWith("/plataforma/")) return true;
  if (caminho.startsWith("/s/[site]")) return true;
  // O layout raiz cobre tudo, inclusive `/s/[site]`.
  return caminho === "/" && tipo === "layout";
}

describe("revalidatePath do site público usa o caminho de destino", () => {
  it("nenhum arquivo revalida uma rota pública pelo endereço do navegador", () => {
    const culpados: string[] = [];
    let chamadas = 0;
    for (const p of arquivos(APP)) {
      const fonte = semComentarios(readFileSync(p, "utf8"));
      for (const m of fonte.matchAll(/revalidatePath\(\s*(["'`])(\/[^"'`]*)\1\s*(?:,\s*["'](layout|page)["'])?/g)) {
        chamadas++;
        if (!caminhoPermitido(m[2], m[3])) culpados.push(`${p.replace(RAIZ, "")}: ${m[2]}`);
      }
    }
    // Recorte que para de achar chamada nenhuma aprova tudo calado.
    expect(chamadas).toBeGreaterThan(20);
    expect(culpados).toEqual([]);
  });

  it("revalidarSitePublico derruba o layout do segmento do site, que existe e é o destino do proxy", async () => {
    const { revalidarSitePublico, ROTA_DO_SITE_PUBLICO } = await import("./revalidar");
    revalidarSitePublico();
    expect(revalidatePath).toHaveBeenCalledWith("/s/[site]", "layout");
    expect(existsSync(join(APP, ...ROTA_DO_SITE_PUBLICO.split("/").filter(Boolean), "layout.tsx"))).toBe(true);
    const proxy = readFileSync(join(RAIZ, "src", "proxy.ts"), "utf8");
    expect(proxy).toContain("destino.pathname = `/s/${site}");
  });
});

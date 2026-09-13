import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O site público não vai ao banco por requisição — guarda de código-fonte
 * (F2 do roadmap de performance, 13/09/2026).
 *
 * A linha de base media 4 a 12 idas ao Supabase (no Canadá) por carga da
 * home, o catálogo de 243 KB baixado duas vezes, e o `proxy.ts` chamando o
 * Auth em TODA requisição — inclusive visitante anônimo, prefetch e arquivo
 * de `public/`. Nenhuma dessas regressões acusa em tipo, teste ou build: a
 * página continua "funcionando", só mais lenta. Por isso a guarda lê o
 * código.
 *
 * O que ela afirma:
 * 1. `queries.ts` não consulta `empreendimentos` nem `corretores` direto:
 *    toda leitura pública passa por `catalogo/cache.ts` (cache por etiqueta).
 * 2. Toda action que revalida a vitrine por caminho também derruba a
 *    etiqueta — sem isso a rota é recalculada com o dado velho, e o corretor
 *    que acabou de publicar um imóvel abre a lista e não o vê.
 * 3. Quem grava `parametros_credito` derruba a etiqueta de crédito.
 * 4. O proxy só fala com o Auth dentro de `/corretor`, com `getClaims`
 *    (verificação local), e o matcher deixa arquivos de fora.
 * 5. `getCorretorAtivo` e `getTemaEscolhido` são deduplicados por `cache()`.
 */

const RAIZ = join(__dirname, "..", "..", "..");
const SRC = join(RAIZ, "src");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function ler(rel: string): string {
  return semComentarios(readFileSync(join(SRC, rel), "utf8"));
}

function arquivosTs(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivosTs(p, saida);
    else if (/\.tsx?$/.test(nome) && !nome.endsWith(".test.ts")) saida.push(p);
  }
  return saida;
}

describe("o site público não vai ao banco por requisição", () => {
  it("queries.ts lê empreendimentos e corretores só pelo cache por etiqueta", () => {
    const fonte = ler("lib/queries.ts");
    expect(fonte).not.toContain('from("empreendimentos")');
    expect(fonte).not.toContain('from("corretores")');
    expect(fonte).toContain('from "@/lib/catalogo/cache"');
  });

  it("o cache do catálogo carrega a etiqueta e a validade de fundo", () => {
    const fonte = ler("lib/catalogo/cache.ts");
    expect(fonte).toContain("unstable_cache(");
    expect(fonte).toMatch(/tags:\s*\[TAG_CATALOGO/);
    expect(fonte).toContain("revalidate: REVALIDA_EM_SEGUNDOS");
  });

  it("toda action que revalida a vitrine por caminho também derruba a etiqueta", () => {
    const culpados: string[] = [];
    for (const p of arquivosTs(join(SRC, "app", "corretor"))) {
      const fonte = semComentarios(readFileSync(p, "utf8"));
      const revalidaVitrine =
        fonte.includes('revalidatePath("/empreendimentos"') || fonte.includes('revalidatePath("/", "layout")');
      if (revalidaVitrine && !fonte.includes("revalidarCatalogo(")) culpados.push(p.replace(RAIZ, ""));
    }
    expect(culpados).toEqual([]);
  });

  it("quem grava parametros_credito derruba a etiqueta de crédito", () => {
    const culpados: string[] = [];
    for (const p of arquivosTs(join(SRC, "app", "corretor"))) {
      const fonte = semComentarios(readFileSync(p, "utf8"));
      const grava = /from\("parametros_credito"\)[\s\S]{0,200}\.(update|upsert|insert)\(/.test(fonte);
      if (grava && !fonte.includes("revalidarCredito(")) culpados.push(p.replace(RAIZ, ""));
    }
    expect(culpados).toEqual([]);
  });

  it("o proxy só fala com o Auth dentro de /corretor, e localmente", () => {
    const fonte = ler("proxy.ts");
    expect(fonte).not.toContain("getUser(");
    const guarda = fonte.indexOf("if (areaDoCorretor)");
    const auth = fonte.indexOf("auth.getClaims(");
    expect(guarda).toBeGreaterThan(-1);
    expect(auth).toBeGreaterThan(guarda);
    // O matcher deixa fora `_next/`, `api/` e qualquer caminho com ponto.
    expect(fonte).toMatch(/matcher:\s*\["\/\(\(\?!_next\/\|api\/\|\.\*\\\\\.\.\*\)\.\*\)"\]/);
  });

  it("getCorretorAtivo e getTemaEscolhido são deduplicados por cache()", () => {
    expect(ler("lib/corretorAtivo.ts")).toMatch(/export const getCorretorAtivo = cache\(/);
    expect(ler("lib/tema.ts")).toMatch(/export const getTemaEscolhido = cache\(/);
    // E o corretor ativo sai da lista cacheada, não do banco.
    expect(ler("lib/corretorAtivo.ts")).not.toContain("from(");
  });
});

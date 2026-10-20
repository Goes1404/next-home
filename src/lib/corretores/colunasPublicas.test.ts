// Guarda da 0196: dado pessoal do corretor fora da chave pública.
//
// `corretores` é lida pela chave `anon` (a página da equipe, o link pessoal).
// Com e-mail REAL gravado na ficha (fase 2), um `select("*")` pela chave
// pública listaria o e-mail de cada corretor de todos os grupos. O banco já
// recusa (a 0196 dá ao `anon` só as colunas públicas), mas a recusa chega
// como erro em produção, com o site da equipe fora do ar. Esta guarda pega
// antes: toda leitura de `corretores` no site público passa pela lista única
// `COLUNAS_PUBLICAS_DE_CORRETOR`, e a lista é a mesma do grant da migration.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encadeamento, semComentarios } from "@/lib/grupos/codigoFonte";
import { SELECT_CORRETOR } from "@/lib/catalogo/selects";
import { COLUNAS_PUBLICAS_DE_CORRETOR } from "./colunasPublicas";

const RAIZ = process.cwd();

/** O que nunca pode ir para a chave pública. */
const PESSOAIS = ["email", "user_id", "deve_trocar_senha"];

function colunas(lista: string): string[] {
  return lista
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function arquivosDe(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivosDe(caminho));
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

/**
 * O site público: a vitrine, o institucional, o catálogo em cache e as
 * consultas da vitrine — mais todo arquivo que use o cliente sem sessão
 * (`supabase/public`), que é a chave `anon` por definição.
 */
function arquivosDoSitePublico(): string[] {
  const pastas = [
    join(RAIZ, "src", "lib", "catalogo"),
    join(RAIZ, "src", "app", "s", "[site]", "(institucional)"),
    join(RAIZ, "src", "app", "s", "[site]", "(vitrine)"),
  ];
  const conjunto = new Set<string>([join(RAIZ, "src", "lib", "queries.ts")]);
  for (const p of pastas) for (const a of arquivosDe(p)) conjunto.add(a);
  for (const a of arquivosDe(join(RAIZ, "src"))) {
    if (/from\s+["']@\/lib\/supabase\/public["']/.test(readFileSync(a, "utf8"))) conjunto.add(a);
  }
  return [...conjunto];
}

type Leitura = { arquivo: string; cadeia: string };

function leiturasDeCorretores(): Leitura[] {
  const saida: Leitura[] = [];
  for (const arquivo of arquivosDoSitePublico()) {
    const codigo = semComentarios(readFileSync(arquivo, "utf8"));
    for (const m of codigo.matchAll(/\.from\(\s*["'`]corretores["'`]\s*\)/g)) {
      saida.push({ arquivo: arquivo.slice(RAIZ.length + 1), cadeia: encadeamento(codigo, m.index!) });
    }
  }
  return saida;
}

describe("corretores pela chave pública (0196)", () => {
  it("a lista pública não tem dado pessoal", () => {
    for (const c of PESSOAIS) expect(colunas(COLUNAS_PUBLICAS_DE_CORRETOR)).not.toContain(c);
  });

  it("a lista pública cobre o que a vitrine mostra", () => {
    const publicas = new Set(colunas(COLUNAS_PUBLICAS_DE_CORRETOR));
    for (const c of colunas(SELECT_CORRETOR)) expect(publicas.has(c), c).toBe(true);
  });

  it("o grant da 0196 é exatamente a lista pública", () => {
    const sql = readFileSync(
      join(RAIZ, "supabase", "migrations", "0196_corretores_sem_dado_pessoal_publico.sql"),
      "utf8",
    )
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(sql).toMatch(/revoke\s+select\s+on\s+public\.corretores\s+from\s+anon\s*;/i);
    const grant = /grant\s+select\s*\(([^)]*)\)\s*on\s+public\.corretores\s+to\s+anon\s*;/i.exec(sql);
    expect(grant, "grant select (...) on public.corretores to anon").not.toBeNull();
    expect(colunas(grant![1]).sort()).toEqual(colunas(COLUNAS_PUBLICAS_DE_CORRETOR).sort());
  });

  it("a lista pública leva o texto da prévia (0188) e a marca da conta oculta (0189)", () => {
    // O `revoke select` de tabela da 0196 leva junto o grant por coluna da
    // 0188: sem `chamada_do_link` na lista, a prévia do link cairia no padrão
    // calada. `oculta` é a segunda trava do recorte no código.
    const publicas = colunas(COLUNAS_PUBLICAS_DE_CORRETOR);
    expect(publicas).toContain("chamada_do_link");
    expect(publicas).toContain("oculta");
  });

  it("a 0196 não mexe nas policies de leitura de corretores (o anon segue sem ver conta oculta)", () => {
    // As duas policies da 0189 ("visiveis ao publico", `not oculta`; "visiveis
    // ao logado") são a primeira trava. Ler a coluna `oculta` não revela nada
    // só porque a linha oculta nem chega ao `anon`.
    const sql = readFileSync(
      join(RAIZ, "supabase", "migrations", "0196_corretores_sem_dado_pessoal_publico.sql"),
      "utf8",
    )
      .split(/\r?\n/)
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
    expect(sql).not.toMatch(/policy/i);
  });

  it("a guarda encontra as leituras do site (não está cega)", () => {
    expect(leiturasDeCorretores().length).toBeGreaterThan(0);
  });

  it("toda leitura de corretores no site público usa COLUNAS_PUBLICAS_DE_CORRETOR", () => {
    const fora = leiturasDeCorretores().filter(
      ({ cadeia }) =>
        !/\.select\(\s*COLUNAS_PUBLICAS_DE_CORRETOR\s*\)/.test(cadeia) || /["'`]\s*\*\s*["'`]/.test(cadeia),
    );
    expect(
      fora.map((l) => `${l.arquivo}: ${l.cadeia.replace(/\s+/g, " ").slice(0, 120)}`),
      "No site público, `corretores` se lê com .select(COLUNAS_PUBLICAS_DE_CORRETOR): " +
        "a chave anon só tem SELECT nessas colunas (0196), e e-mail, user_id e " +
        "deve_trocar_senha não podem sair do banco por ela.",
    ).toEqual([]);
  });
});

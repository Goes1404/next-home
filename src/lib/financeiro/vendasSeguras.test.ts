import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O que não pode afrouxar nas vendas (0114). A regressão seria calada: a tela
 * continuaria igual, e só uma chamada direta à API mostraria o corretor
 * marcando a própria comissão como paga.
 */

const DIR = join(process.cwd(), "supabase", "migrations");
const semComentarios = (sql: string) => sql.replace(/--.*$/gm, "");
const todas = () =>
  readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => semComentarios(readFileSync(join(DIR, n), "utf8")))
    .join("\n");

describe("vendas: dinheiro recebido/pago é só do gestor", () => {
  const sql = todas();
  const grantsDeUpdate = [...sql.matchAll(/grant\s+update\s*\(([^)]*)\)\s*on\s+public\.(vendas|venda_participantes)\s+to\s+authenticated/gi)];

  it("existe grant de update por coluna nas duas tabelas", () => {
    expect(grantsDeUpdate.map((m) => m[2]).sort()).toEqual(["venda_participantes", "vendas"]);
  });

  it("nenhum grant de update para authenticated inclui as datas de recebido/pago", () => {
    for (const m of grantsDeUpdate) {
      expect(m[1]).not.toMatch(/comissao_recebida_em|repasse_pago_em/);
    }
  });

  it("nenhum grant de update de TABELA inteira para authenticated", () => {
    expect(sql).not.toMatch(/grant\s+[^;]*\bupdate\b(?!\s*\()[^;]*on\s+public\.(vendas|venda_participantes)\s+to\s+authenticated/i);
  });

  it("salvar_venda roda como quem chama (a RLS vale dentro dela)", () => {
    const corpo = sql.slice(sql.indexOf("function public.salvar_venda"));
    expect(corpo.slice(0, 400)).toMatch(/security\s+invoker/i);
  });

  it("a chave pública não alcança as vendas", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.vendas\s+from\s+anon/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.venda_participantes\s+from\s+anon/i);
  });
});

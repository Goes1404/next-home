import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O que a 0232 não pode perder (Fase A do financeiro). Lê o SQL sem
 * comentários: a regressão seria calada (a tela continua igual, e só uma
 * chamada direta à API ou o dinheiro sumindo da migração mostrariam).
 */

const ARQUIVO = join(process.cwd(), "supabase", "migrations", "0232_financeiro_fase_a.sql");
const sql = existsSync(ARQUIVO) ? readFileSync(ARQUIVO, "utf8").replace(/--.*$/gm, "") : "";

/** O corpo da ÚLTIMA definição da função (âncora no `create or replace`, lição da 0115). */
function corpo(nome: string): string {
  const i = sql.lastIndexOf(`create or replace function public.${nome}(`);
  if (i < 0) return "";
  return sql.slice(i, sql.indexOf("$$;", i));
}

describe("0232: a migração não perde dinheiro", () => {
  it("a migration existe", () => {
    expect(sql).not.toBe("");
  });

  it("cada venda vira parcela ANTES das colunas antigas saírem", () => {
    const backfill = sql.search(/insert\s+into\s+public\.venda_parcelas[\s\S]*?from\s+public\.vendas/i);
    const drop = sql.search(/drop\s+column\s+(if\s+exists\s+)?comissao_recebida_em/i);
    expect(backfill).toBeGreaterThan(-1);
    expect(drop).toBeGreaterThan(backfill);
  });

  it("a parcela migrada leva valor, vencimento e recebimento da venda", () => {
    const i = sql.search(/insert\s+into\s+public\.venda_parcelas/i);
    const trecho = sql.slice(i, sql.indexOf(";", i));
    expect(trecho).toMatch(/comissao_valor/);
    expect(trecho).toMatch(/comissao_prevista_em/);
    expect(trecho).toMatch(/comissao_recebida_em/);
  });
});

describe("0232: parâmetros fiscais são da plataforma", () => {
  it("anon fora e authenticated só lê", () => {
    expect(sql).toMatch(/revoke\s+all\s+on\s+public\.parametros_fiscais\s+from\s+anon/i);
    expect(sql).not.toMatch(/grant\s+[^;]*\b(insert|update|delete|all)\b[^;]*on\s+public\.parametros_fiscais\s+to\s+authenticated/i);
    expect(sql).toMatch(/grant\s+select\s+on\s+public\.parametros_fiscais\s+to\s+authenticated/i);
  });
});

describe("0232: o que mexe no dinheiro da imobiliária é do gestor", () => {
  it.each(["marcar_parcela_recebida", "distratar_venda", "desfazer_distrato"])("%s confere gestor e grupo", (nome) => {
    const c = corpo(nome);
    expect(c, nome).toMatch(/security\s+definer/i);
    expect(c, nome).toMatch(/eh_gestor\(\)/);
    expect(c, nome).toMatch(/grupo_atual\(\)/);
    expect(c, nome).toMatch(/set\s+search_path\s*=\s*''/i);
  });

  it("avisar_distrato só para quem registrou ou participa, no grupo", () => {
    const c = corpo("avisar_distrato");
    expect(c).toMatch(/security\s+definer/i);
    expect(c).toMatch(/corretor_atual\(\)/);
    expect(c).toMatch(/venda_participantes/);
    expect(c).toMatch(/grupo_atual\(\)/);
  });

  it("um gatilho guarda a forma de recebimento e confere o gestor", () => {
    const c = corpo("venda_participantes_forma_so_gestor");
    expect(c).toMatch(/eh_gestor\(\)/);
    expect(sql).toMatch(/before\s+insert\s+or\s+update\s+of\s+forma_recebimento\s+on\s+public\.venda_participantes/i);
  });

  it("a linha `direto` não some pela mão do corretor (apagar e reinserir)", () => {
    expect(corpo("venda_participantes_direto_so_gestor_apaga")).toMatch(/eh_gestor\(\)/);
    expect(sql).toMatch(/before\s+delete\s+on\s+public\.venda_participantes/i);
  });

  it("marcar comissão recebida da venda inteira deixa de existir", () => {
    expect(sql).toMatch(/drop\s+function\s+(if\s+exists\s+)?public\.marcar_comissao_recebida/i);
  });

  it("salvar_venda continua rodando como quem chama e ganha as parcelas", () => {
    const c = corpo("salvar_venda");
    expect(c).toMatch(/p_parcelas\s+jsonb/);
    expect(c.slice(0, 500)).toMatch(/security\s+invoker/i);
    expect(sql).toMatch(/drop\s+function\s+(if\s+exists\s+)?public\.salvar_venda\(uuid,\s*jsonb,\s*jsonb\)/i);
  });
});

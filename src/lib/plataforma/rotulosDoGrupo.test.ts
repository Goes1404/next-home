import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLANOS, ROTULO_DO_PLANO, ROTULO_DO_TIPO, SITUACOES, TIPOS_DE_GRUPO } from "./rotulosDoGrupo";

/**
 * As listas da tela e da action são as dos CHECKs de `grupos`. Uma lista
 * que diverge do banco oferece um plano que o banco recusa (erro cru) ou
 * esconde um que ele aceita.
 */
function listaDoCheck(arquivo: string, coluna: string): string[] {
  const sql = readFileSync(`supabase/migrations/${arquivo}`, "utf8");
  const m = new RegExp(`check \\(${coluna} in \\(([^)]*)\\)\\)`).exec(sql);
  if (!m) throw new Error(`CHECK de ${coluna} não achado em ${arquivo}`);
  return m[1].split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
}

describe("vocabulário do grupo", () => {
  it("tipo, plano e situação são os dos CHECKs", () => {
    expect([...TIPOS_DE_GRUPO]).toEqual(listaDoCheck("0190_grupos.sql", "tipo"));
    expect([...PLANOS]).toEqual(listaDoCheck("0195_grupos_da_plataforma.sql", "plano"));
    expect([...SITUACOES]).toEqual(listaDoCheck("0195_grupos_da_plataforma.sql", "situacao"));
  });

  it("todo valor tem rótulo", () => {
    expect(Object.keys(ROTULO_DO_TIPO).sort()).toEqual([...TIPOS_DE_GRUPO].sort());
    expect(Object.keys(ROTULO_DO_PLANO).sort()).toEqual([...PLANOS].sort());
  });
});

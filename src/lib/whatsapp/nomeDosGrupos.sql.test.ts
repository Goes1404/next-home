import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0220_nome_dos_grupos_de_leads.sql"), "utf8");

describe("0220: nome dos grupos de leads", () => {
  it("o padrão é por imobiliária e exige {corretor}", () => {
    expect(sql).toMatch(/add column if not exists padrao_nome_grupo_leads text/);
    expect(sql).toMatch(/position\('\{corretor\}' in padrao_nome_grupo_leads\) > 0/);
    expect(sql).toMatch(/char_length\(padrao_nome_grupo_leads\) <= 60/);
  });

  it("a Aretz continua com NOME & ARETZ", () => {
    expect(sql).toMatch(/set padrao_nome_grupo_leads = '\{corretor\} & ARETZ'\s+where slug = 'aretzimobi'/);
  });

  it("o vínculo à mão é marcado por corretor", () => {
    expect(sql).toMatch(/add column if not exists whatsapp_grupo_leads_manual boolean not null default false/);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function ler(arquivo: string): string {
  return readFileSync(join(process.cwd(), "supabase", "migrations", arquivo), "utf8");
}

describe("migration 0217: roleta com aviso no grupo", () => {
  it("a roleta pula pausa e conta oculta, e no modo grupo exige grupo, não conexão", () => {
    const sql = ler("0217_roleta_aviso_no_grupo.sql");
    expect(sql).toMatch(/not c\.em_pausa/);
    expect(sql).toMatch(/not c\.oculta/);
    expect(sql).toMatch(/p_modo = 'grupo'[\s\S]*whatsapp_grupo_leads_jid is not null/);
    expect(sql).toMatch(/drop function if exists public\.proximo_da_roleta\(uuid, uuid\[\]\)/);
  });

  it("o modo grupo só vale com o envio para grupos ligado, e o modo mensagem mantém a conexão", () => {
    const sql = ler("0217_roleta_aviso_no_grupo.sql");
    expect(sql).toContain("envio_grupo_leads_ativo");
    expect(sql).toMatch(/w\.status_conexao = 'conectado'/);
    expect(sql).toMatch(/modo_aviso text not null default 'mensagem'/);
    expect(sql).toMatch(/check \(modo_aviso in \('mensagem', 'grupo'\)\)/);
  });

  it("a fila aceita cancelado", () => {
    const sql = ler("0217_roleta_aviso_no_grupo.sql");
    expect(sql).toMatch(/'pendente', 'enviando', 'enviado', 'erro', 'cancelado'/);
  });

  it("o aviso segue o dono atual e não reabre envio já feito", () => {
    const sql = ler("0217_roleta_aviso_no_grupo.sql");
    expect(sql).toContain("enfileirar_aviso_do_lead");
    expect(sql).toMatch(/where public\.lead_envios_grupo\.status in \('pendente', 'erro'\)/);
    expect(sql).toMatch(/trazido_por = 'corretor'/);
    expect(sql).toMatch(/grant execute on function public\.enfileirar_aviso_do_lead\(uuid\) to service_role/);
  });
});

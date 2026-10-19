import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIAS_MINIMOS_SEM_RESPOSTA,
  TETO_SEM_RESPOSTA,
  descreverContagem,
  nivelDaContagem,
} from "./higieneDaBase";

function ultimaDefinicao(nome: string): string {
  const pasta = join(process.cwd(), "supabase/migrations");
  const arquivos = readdirSync(pasta).filter((a) => a.endsWith(".sql")).sort();
  let corpo = "";
  for (const a of arquivos) {
    const sql = readFileSync(join(pasta, a), "utf8");
    const i = sql.indexOf(`create or replace function public.${nome}(`);
    if (i >= 0) corpo = sql.slice(i, sql.indexOf("$$;", i));
  }
  return corpo;
}

describe("higiene da base", () => {
  it("a tela e o banco usam o mesmo teto e o mesmo prazo", () => {
    const sql = ultimaDefinicao("arquivar_leads_sem_resposta");
    expect(sql).toContain(`tentativas_sem_resposta >= ${TETO_SEM_RESPOSTA}`);
    expect(sql).toContain(`interval '${DIAS_MINIMOS_SEM_RESPOSTA} days'`);
  });

  it("arquiva, nunca exclui, e poupa quem fechou ou tem visita marcada", () => {
    const sql = ultimaDefinicao("arquivar_leads_sem_resposta");
    expect(sql).not.toMatch(/delete\s+from/i);
    expect(sql).toContain("arquivado_motivo = 'sem_resposta'");
    expect(sql).toContain("etapa <> 'fechado'");
    expect(sql).toContain("visita_agendada_em");
  });

  it("quando o cliente responde, desarquiva só o que a regra arquivou", () => {
    const sql = ultimaDefinicao("registrar_resposta_do_lead");
    expect(sql).toMatch(/when arquivado_motivo = 'sem_resposta' then null else arquivado_em/);
  });

  it("pinta a contagem pelo quanto falta", () => {
    expect(nivelDaContagem(0)).toBe("nenhum");
    expect(nivelDaContagem(1)).toBe("normal");
    expect(nivelDaContagem(3)).toBe("atencao");
    expect(nivelDaContagem(TETO_SEM_RESPOSTA - 1)).toBe("ultima");
    expect(descreverContagem(1)).toContain("1 tentativa sem resposta");
    expect(descreverContagem(TETO_SEM_RESPOSTA - 1)).toContain("última");
  });
});

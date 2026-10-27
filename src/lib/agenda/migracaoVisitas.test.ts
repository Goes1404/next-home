import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O texto da 0222 (visitas com histórico). A suíte de banco confere o efeito;
 * esta guarda pega, sem Docker, o bloco de isolamento esquecido e a reserva
 * que voltaria a lançar exceção quando a trava de 60 min recusa.
 */
describe("0222: visitas com histórico", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0222_visitas_com_historico.sql"), "utf8");

  it("tem o isolamento por grupo com as duas mães (lead e corretor)", () => {
    expect(sql).toMatch(/create policy isolamento_por_grupo on public\.visitas as restrictive/);
    for (const nome of ["visitas_00_grupo", "visitas_zz_grupo_update", "visitas_zz_grupo_insert"]) {
      expect(sql).toContain(`create trigger ${nome}`);
    }
    expect(sql.match(/'lead_id', 'leads', 'id',\s+'corretor_id', 'corretores', 'id'/g)).toHaveLength(3);
    expect(sql).toContain("revoke all on public.visitas from anon");
    expect(sql).toContain("revoke all on public.visitas from authenticated");
  });

  it("a trava de conflito é declarativa: exclusão de intervalo por corretor", () => {
    expect(sql).toContain("create extension if not exists btree_gist");
    expect(sql).toMatch(/exclude using gist \(corretor_id with =, tstzrange\(inicio, fim, '\[\)'\) with &&\)/);
    expect(sql).toMatch(/with &&\)\s+where \(status = 'marcada'\)/);
  });

  it("pega o lock de leads de uma vez no começo (sem escalada com a IA)", () => {
    const lock = sql.indexOf("lock table public.leads in access exclusive mode;");
    expect(lock).toBeGreaterThan(sql.indexOf("set local lock_timeout = '5s';"));
    expect(lock).toBeLessThan(sql.indexOf("create table if not exists public.visitas"));
  });

  it("a troca de dono captura o conflito em vez de derrubar o update do lead", () => {
    const espelho = sql.slice(sql.indexOf("function public.espelhar_visita_do_lead"), sql.indexOf("function public.reservar_horario_visita"));
    expect(espelho.match(/when exclusion_violation then/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("o índice da 0074 sai: a exclusão o substitui e ele travava a troca de dono", () => {
    expect(sql).toContain("drop index if exists public.leads_visita_sem_conflito_idx");
  });

  it("a reserva da IA devolve false também na recusa da exclusão", () => {
    const reserva = sql.slice(sql.indexOf("function public.reservar_horario_visita"));
    expect(reserva).toMatch(/when unique_violation or exclusion_violation then/);
  });
});

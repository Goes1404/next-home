import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Teste de fonte (29/10/2026): as notificações agendadas (lembrete de visita,
 * lead parado, senha vencendo) rodam no tique dos follow-ups, que o pg_cron
 * chama a cada 5 min — o plano Hobby da Vercel só permite cron diário. E
 * rodam ANTES da janela comercial do cliente: são avisos ao próprio
 * corretor, cada um com o próprio horário.
 */
const fonte = readFileSync(join(process.cwd(), "src", "app", "api", "cron", "followups", "route.ts"), "utf8");

describe("tique dos follow-ups: notificações no celular", () => {
  const janela = fonte.indexOf("if (!dentroDaJanela(new Date()))");

  for (const chamada of ["lembrarVisitasDaProximaHora(supabase)", "avisarLeadsParados(supabase)", "avisarSenhasVencendo(supabase)"]) {
    it(`${chamada} roda antes da janela comercial e não derruba o tique`, () => {
      const pos = fonte.indexOf(chamada);
      expect(pos).toBeGreaterThan(-1);
      expect(pos).toBeLessThan(janela);
      expect(fonte.slice(pos, pos + 120)).toContain(".catch(");
    });
  }

  it("os três números saem na resposta do tique", () => {
    expect(fonte.match(/leadsNovos, lembretesDeVisita, leadsParados, senhasVencendo/g)).toHaveLength(2);
  });
});

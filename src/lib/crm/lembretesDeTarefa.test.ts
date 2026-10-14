import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte: os lembretes do corretor (anotações e tarefas)
 * saem na hora que ELE marcou. Pendurados depois da janela comercial do
 * runner, um lembrete das 8h só sairia às 9h — calado, com build verde.
 */
const rota = readFileSync(join(process.cwd(), "src/app/api/cron/followups/route.ts"), "utf8").replace(
  /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
  "",
);

describe("lembretes do corretor no runner dos follow-ups", () => {
  const janela = rota.indexOf("if (!dentroDaJanela(");

  it("a janela comercial existe no runner", () => {
    expect(janela).toBeGreaterThan(0);
  });

  it("o lembrete da tarefa do lead roda antes da janela", () => {
    const chamada = rota.indexOf("processarLembretesDeTarefa(supabase)");
    expect(chamada).toBeGreaterThan(0);
    expect(chamada).toBeLessThan(janela);
  });

  it("o lembrete da anotação roda antes da janela", () => {
    const chamada = rota.indexOf("await processarLembretesDeAnotacao(supabase)");
    expect(chamada).toBeGreaterThan(0);
    expect(chamada).toBeLessThan(janela);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MENSAGEM_CONFLITO, ehConflitoDeHorario } from "./conflito";

describe("ehConflitoDeHorario", () => {
  it("reconhece a exclusão de 60 min (0222) e o índice único antigo (0074)", () => {
    expect(ehConflitoDeHorario({ code: "23P01" })).toBe(true);
    expect(ehConflitoDeHorario({ code: "23505" })).toBe(true);
  });

  it("não confunde outro erro com conflito de horário", () => {
    expect(ehConflitoDeHorario({ code: "42501" })).toBe(false);
    expect(ehConflitoDeHorario({})).toBe(false);
    expect(ehConflitoDeHorario(null)).toBe(false);
    expect(ehConflitoDeHorario(undefined)).toBe(false);
  });

  it("a mensagem do painel é a combinada", () => {
    expect(MENSAGEM_CONFLITO).toBe("Você já tem outro compromisso nesse horário.");
  });
});

/*
 * Os escritores do painel que gravam a visita respondem ao conflito com a
 * mensagem certa. Antes da 0222 só o `23505` existia; com a exclusão de 60 min
 * o banco recusa com `23P01`, e um `=== "23505"` solto mostraria "Não foi
 * possível salvar" para um horário simplesmente ocupado.
 */
describe("escritores da visita no painel", () => {
  const ler = (caminho: string) => readFileSync(join(process.cwd(), caminho), "utf8");
  for (const caminho of [
    "src/app/corretor/actions.ts",
    "src/app/corretor/(painel)/_componentes/acoesVisitaCombinada.ts",
  ]) {
    it(`${caminho} trata o conflito pelo ehConflitoDeHorario`, () => {
      const fonte = ler(caminho);
      expect(fonte).toContain("ehConflitoDeHorario(");
      expect(fonte).toContain("MENSAGEM_CONFLITO");
      expect(fonte).not.toMatch(/code === "23505"/);
    });
  }
});

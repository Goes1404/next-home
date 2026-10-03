import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blocoRegrasDoCorretor } from "./aiAgent";

/*
 * As regras do corretor para a IA (0154). Nasceram de um flagra: no anúncio
 * do Dom Parque (02/10/2026) a corretora escreveu as instruções dentro do
 * chat da cliente, e a cliente recebeu. A regressão aqui é calada: um
 * caminho que monta a identidade sem as regras faz a IA atender "do jeito
 * padrão" só naquele caminho, e ninguém percebe.
 */

const semComentarios = (arquivo: string) =>
  readFileSync(arquivo, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");

describe("blocoRegrasDoCorretor", () => {
  it("sem regras, não acrescenta nada ao prompt", () => {
    expect(blocoRegrasDoCorretor("Bruna", null)).toBe("");
    expect(blocoRegrasDoCorretor("Bruna", "   ")).toBe("");
  });

  it("com regras, cita o corretor e não passa por cima da segurança", () => {
    const bloco = blocoRegrasDoCorretor("Bruna", "Pergunte a renda familiar.");
    expect(bloco).toContain("REGRAS DE BRUNA");
    expect(bloco).toContain("Pergunte a renda familiar.");
    expect(bloco).toContain("inventar informação");
  });

  it("o prompt do agente leva o bloco", () => {
    expect(semComentarios("src/lib/whatsapp/aiAgent.ts")).toContain("blocoRegrasDoCorretor(ctx.nomeCorretor, ctx.regrasDaIa)");
  });

  it.each([
    "src/app/api/webhooks/whatsapp/route.ts",
    "src/app/api/cron/followups/route.ts",
    "src/app/corretor/(painel)/conversas/acoes.ts",
    "src/app/corretor/(painel)/whatsapp/acoes.ts",
    "src/lib/whatsapp/aberturaPelaIA.ts",
  ])("%s passa as regras do corretor para o turno", (arquivo) => {
    const codigo = semComentarios(arquivo);
    const chamadas = codigo.split("executarTurnoDeAtendimento({").length - 1;
    const comRegras = (codigo.match(/regrasDaIa:/g) ?? []).length;
    expect(chamadas).toBeGreaterThan(0);
    expect(comRegras).toBeGreaterThanOrEqual(chamadas);
  });
});

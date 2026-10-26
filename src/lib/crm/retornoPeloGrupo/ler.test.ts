import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * `lerRetornoDaLigacao` fala com o modelo, então não roda em teste. O que dá
 * para travar é o contrato com a chamada: temperatura baixa e o "agora" no
 * fuso de São Paulo — sem ele, "sábado" e "amanhã" seriam resolvidos pelo
 * relógio do servidor (UTC) e a visita cairia um dia fora de certas horas.
 */
const fonte = readFileSync(join(__dirname, "ler.ts"), "utf8");

describe("ler.ts", () => {
  it("chama o modelo por chamarLlmJson com temperatura 0.1", () => {
    expect(fonte).toMatch(/chamarLlmJson\(/);
    expect(fonte).toMatch(/temperature:\s*0\.1/);
  });

  it("entrega ao prompt o agora no fuso America/Sao_Paulo, com dia da semana", () => {
    expect(fonte).toContain("America/Sao_Paulo");
    expect(fonte).toMatch(/weekday:\s*"long"/);
  });

  it("pede visitaEm com offset -03:00", () => {
    expect(fonte).toContain("-03:00");
  });

  it("normaliza a saída com normalizarLeituraDoRetorno antes de devolver", () => {
    expect(fonte).toMatch(/normalizarLeituraDoRetorno\(/);
  });
});

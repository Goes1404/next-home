import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ehSaudacaoAutomatica } from "./saudacaoAutomatica";

const AGORA = new Date("2026-10-03T17:05:24Z");
const segundosAntes = (s: number) => new Date(AGORA.getTime() - s * 1000).toISOString();

describe("ehSaudacaoAutomatica", () => {
  it("a saudação do lead novo do anúncio (03/10, 14h05) é automática", () => {
    expect(
      ehSaudacaoAutomatica({
        agora: AGORA,
        leadCriadoEm: segundosAntes(4),
        ultimaFalaDoClienteEm: segundosAntes(4),
        ultimaFalaDoCorretorEm: null,
      }),
    ).toBe(true);
  });

  it("mensagem de ausência para lead antigo que acabou de escrever é automática", () => {
    expect(
      ehSaudacaoAutomatica({
        agora: AGORA,
        leadCriadoEm: segundosAntes(86_400 * 30),
        ultimaFalaDoClienteEm: segundosAntes(3),
        ultimaFalaDoCorretorEm: segundosAntes(86_400 * 20),
      }),
    ).toBe(true);
  });

  it("o \"Oii\" digitado 11 segundos depois é fala dela", () => {
    expect(
      ehSaudacaoAutomatica({
        agora: AGORA,
        leadCriadoEm: segundosAntes(15),
        ultimaFalaDoClienteEm: segundosAntes(15),
        ultimaFalaDoCorretorEm: null,
      }),
    ).toBe(false);
  });

  it("quem já estava conversando nunca manda saudação automática", () => {
    expect(
      ehSaudacaoAutomatica({
        agora: AGORA,
        leadCriadoEm: segundosAntes(4),
        ultimaFalaDoClienteEm: segundosAntes(2),
        ultimaFalaDoCorretorEm: segundosAntes(60),
      }),
    ).toBe(false);
  });

  it("o webhook decide antes de gravar e não grava a saudação nem desliga a IA", () => {
    const codigo = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
    const decide = codigo.indexOf("const saudacaoAutomatica = ehSaudacaoAutomatica(");
    const sai = codigo.indexOf('action: "saudacao_automatica_ignorada"');
    const grava = codigo.indexOf('remetente: "corretor"', decide);
    const desliga = codigo.indexOf("await desligarIaPorFalaDoCorretor(conversa.id)");
    expect(decide).toBeGreaterThan(-1);
    expect(sai).toBeGreaterThan(decide);
    expect(grava).toBeGreaterThan(sai);
    expect(desliga).toBeGreaterThan(sai);
  });
});

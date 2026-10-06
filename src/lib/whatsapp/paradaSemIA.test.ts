import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Pedido de parada com a IA calada (06/10/2026).
 *
 * O detector de recusa só rodava no turno da IA, e desde a 0152 a IA desliga
 * quando o corretor fala. Na maioria das conversas, "me tira da lista" não
 * era gravado e o lead voltava a receber a próxima lista de transmissão. A
 * regressão é calada: tudo funciona, só a marca não é gravada.
 */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("o pedido de parada é lido com a IA calada", () => {
  const webhook = semComentarios(readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8"));

  it("o ramo do silêncio chama registrarParadaSemIA antes de devolver", () => {
    const inicio = webhook.indexOf("if (!decisaoIA.responde) {");
    const fim = webhook.indexOf('action: "ia_calada"', inicio);
    expect(inicio).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(inicio);
    expect(webhook.slice(inicio, fim)).toContain("registrarParadaSemIA(");
  });

  it("sem IA, a conversa continua do corretor: não muda etapa nem liga/desliga a IA", () => {
    const repo = semComentarios(readFileSync("src/lib/whatsapp/repositorio.ts", "utf8"));
    const inicio = repo.indexOf("export async function registrarParadaSemIA(");
    const fim = repo.indexOf("\n}\n", inicio);
    const corpo = repo.slice(inicio, fim);
    expect(inicio).toBeGreaterThan(0);
    expect(corpo).toContain("nao_contatar_em");
    expect(corpo).toContain("whatsapp_campanhas_fila");
    expect(corpo).not.toContain("etapa");
    expect(corpo).not.toContain("bot_ativo");
  });
});

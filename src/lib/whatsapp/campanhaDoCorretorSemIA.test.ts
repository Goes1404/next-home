import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Lead da campanha do PRÓPRIO corretor (etiqueta de anúncio da Meta na linha
 * dele) recebe uma única boas-vindas, depois não é atendido pela IA: é
 * cadastrado, o resumo da ficha segue sendo feito, e quem conversa é o
 * corretor (pedido do dono, 20/10/2026).
 *
 * A regressão seria calada: a IA voltaria a responder o cliente do anúncio
 * pago sem nada quebrar. Esta guarda lê o webhook.
 */
const codigo = readFileSync(join(process.cwd(), "src/app/api/webhooks/whatsapp/route.ts"), "utf8").replace(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
  "",
);

describe("lead da campanha do próprio corretor recebe boas-vindas e não é atendido pela IA", () => {
  it("o bloco do impulsionamento manda uma boas-vindas antes de desligar a IA", () => {
    const inicio = codigo.indexOf("if (anuncioMeta && !nomeDoAnuncio)");
    expect(inicio).toBeGreaterThan(-1);
    const bloco = codigo.slice(inicio, codigo.indexOf("const decisaoIA", inicio));
    expect(bloco).toContain("registrarLeadDeImpulsionamento(");
    expect(bloco).toContain("BOAS_VINDAS_DE_CAMPANHA");
    expect(bloco.indexOf("enviarMensagemWhatsapp(")).toBeLessThan(bloco.indexOf("calarIaNaConversaDeCampanha(conversa.id)"));
    expect(bloco).toContain("calarIaNaConversaDeCampanha(conversa.id)");
    expect(bloco).toContain("iaCaladaPelaCampanha = true");
  });

  it("a decisão de responder já enxerga a IA calada", () => {
    const decisao = codigo.indexOf("decidirSeAIaResponde(");
    const trecho = codigo.slice(decisao, decisao + 300);
    expect(trecho).toContain("iaCaladaPelaCampanha ? { ...conversa, botAtivo: false } : conversa");
  });

  it("o desligamento acontece ANTES da decisão de responder", () => {
    const calar = codigo.indexOf("calarIaNaConversaDeCampanha(conversa.id)");
    const decisao = codigo.indexOf("decidirSeAIaResponde(");
    expect(calar).toBeGreaterThan(-1);
    expect(decisao).toBeGreaterThan(calar);
  });

  it("o resumo da ficha continua rodando no caminho do silêncio", () => {
    const silencio = codigo.indexOf("if (!decisaoIA.responde)");
    const proximo = codigo.indexOf("atualizarFichaEMemoria(", silencio);
    expect(silencio).toBeGreaterThan(-1);
    expect(proximo).toBeGreaterThan(silencio);
  });
});

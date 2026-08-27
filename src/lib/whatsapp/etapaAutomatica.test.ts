import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guardas de leitura de código para o avanço automático de etapa.
 *
 * O funil só anda sozinho em dois FATOS: primeira resposta entregue
 * (novo → primeiro_contato) e visita confirmada (→ visita_agendada). As
 * etapas do meio são humanas de propósito — o dossiê da IA oscila entre
 * leituras, e etapa que anda e volta sozinha destrói a confiança do
 * corretor no quadro.
 */

const REPOSITORIO = readFileSync("src/lib/whatsapp/repositorio.ts", "utf8");
const WEBHOOK = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
const DISPARADOR = readFileSync("src/lib/whatsapp/campaignDispatcher.ts", "utf8");

describe("novo → primeiro_contato automático", () => {
  it("o update só alcança quem ainda está em 'novo' — o termostato do funil", () => {
    const fn = REPOSITORIO.slice(
      REPOSITORIO.indexOf("export async function avancarLeadParaPrimeiroContato"),
    );
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    expect(corpo).toContain('.eq("etapa", "novo")');
    expect(corpo).toContain('etapa: "primeiro_contato"');
    expect(corpo).toContain("etapa_alterada_em");
  });

  it("o webhook só avança quando a resposta foi ENTREGUE", () => {
    const chamada = WEBHOOK.indexOf("avancarLeadParaPrimeiroContato(");
    expect(chamada).toBeGreaterThan(-1);
    const contexto = WEBHOOK.slice(chamada - 200, chamada);
    // Resposta que falhou no envio não é contato com ninguém.
    expect(contexto).toContain("envio.enviado");
  });

  /*
   * A campanha ficou de fora por dois meses, e o defeito era CALADO: as
   * mensagens saíam, o Live Chat mostrava tudo certo, e o quadro seguia
   * dizendo "Novo lead" para quem já tinha sido abordado. Medido em
   * produção: 10 leads com mensagem entregue, nenhum fora de "Novo".
   */
  it("o disparo de campanha também avança o lead", () => {
    expect(DISPARADOR).toContain("avancarLeadParaPrimeiroContato(");
  });

  it("o disparador só avança DEPOIS de gravar o envio como bem-sucedido", () => {
    // Compara POSIÇÕES em vez de fatiar uma janela de N caracteres: a
    // janela quebrava a cada comentário novo entre os dois pontos, e o que
    // o teste protege é a ordem — mensagem que não saiu não é contato com
    // ninguém, mesma régua do webhook.
    const gravouEnvio = DISPARADOR.indexOf('status: "enviado"');
    const avanco = DISPARADOR.indexOf("avancarLeadParaPrimeiroContato(", gravouEnvio);
    expect(gravouEnvio).toBeGreaterThan(-1);
    expect(avanco).toBeGreaterThan(gravouEnvio);
  });

  it("nenhum caminho escreve etapa de julgamento (negociação etc.) automaticamente", () => {
    for (const arquivo of [REPOSITORIO, WEBHOOK, DISPARADOR]) {
      expect(arquivo).not.toContain('etapa: "documentacao"');
      expect(arquivo).not.toContain('etapa: "fechado"');
      expect(arquivo).not.toContain('etapa: "perdido"');
    }
  });
});

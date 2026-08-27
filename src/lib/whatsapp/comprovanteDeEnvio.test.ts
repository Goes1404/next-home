import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Todo caminho que MANDA mensagem guarda o comprovante do provedor.
 *
 * O `provider_message_id` não é enfeite: é a chave pela qual o ACK de
 * entrega que chega no webhook (0051) encontra a mensagem para carimbar o
 * ✓✓. Sem ele, o sistema não distingue "a mensagem chegou" de "a chamada
 * HTTP não deu erro" — e foi exatamente essa a dúvida que originou este
 * arquivo: 27 disparos marcados como enviados, zero com id do provedor e
 * zero com status de entrega, sem como provar nem desmentir.
 *
 * Leitura de código porque a regressão é calada em dobro: a mensagem sai,
 * o painel diz "enviado", e o que se perde é só a CAPACIDADE DE VERIFICAR.
 */

const CAMINHOS = {
  "disparo de campanha": "src/lib/whatsapp/campaignDispatcher.ts",
  "follow-up automático": "src/app/api/cron/followups/route.ts",
  "resposta da IA (webhook)": "src/app/api/webhooks/whatsapp/route.ts",
  "mensagem do corretor (Live Chat)": "src/app/corretor/(painel)/conversas/acoes.ts",
};

describe("comprovante de envio", () => {
  for (const [nome, arquivo] of Object.entries(CAMINHOS)) {
    it(`${nome} grava o id do provedor`, () => {
      const codigo = readFileSync(arquivo, "utf8");
      const grava = codigo.indexOf("gravarMensagem(");
      expect(grava, `${arquivo} não grava mensagem`).toBeGreaterThan(-1);
      expect(codigo).toContain("providerMessageId");
    });

    it(`${nome} só afirma "enviada" quando o provedor confirmou`, () => {
      const codigo = readFileSync(arquivo, "utf8");
      // O status de entrega nasce da EXISTÊNCIA do id. Um 2xx sem chave é
      // justamente o caso que não se pode afirmar como enviado.
      expect(codigo).toMatch(/statusEntrega:\s*\w+(\.\w+)*\s*\?\s*"enviada"\s*:\s*null/);
    });
  }
});

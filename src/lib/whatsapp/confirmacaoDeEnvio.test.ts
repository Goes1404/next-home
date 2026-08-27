import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enviarMensagemWhatsapp } from "./provider";

/**
 * 2xx do provedor NÃO é prova de envio.
 *
 * Em 27/08/2026 o painel mostrou 27 mensagens "enviadas" que nunca
 * apareceram no WhatsApp do corretor. O sinal estava no dado desde o começo
 * e eu o subestimei: nenhuma das 27 tinha `key.id`. A Evolution devolve a
 * chave da mensagem em TODO envio real — é dela que sai o ✓✓ depois. Um 2xx
 * sem chave é a chamada HTTP tendo sucesso sem que mensagem nenhuma saia.
 *
 * O código antigo fazia `res.json().catch(() => null)` e seguia como
 * sucesso, jogando fora o corpo da resposta — a única pista do que o
 * provedor realmente disse.
 */

const respostaReal = {
  key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: true, id: "3EB0C1" },
  status: "PENDING",
};

function fingirResposta(status: number, corpo: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(corpo, { status, headers: { "Content-Type": "application/json" } })),
  );
}

describe("confirmação de envio", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_API_URL", "https://evolution.exemplo");
    vi.stubEnv("WHATSAPP_API_KEY", "chave-de-teste");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const envio = () =>
    enviarMensagemWhatsapp({
      instanceName: "nexthome-teste",
      telefone: "11999999999",
      texto: "Olá, tudo bem?",
    });

  it("envio real: devolve o id da mensagem", async () => {
    fingirResposta(201, JSON.stringify(respostaReal));
    const r = await envio();
    expect(r.enviado).toBe(true);
    expect(r.messageId).toBe("3EB0C1");
  });

  it("2xx SEM key.id não é envio — é falha", async () => {
    fingirResposta(200, JSON.stringify({ status: "ok" }));
    const r = await envio();
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("sem_confirmacao");
  });

  it("guarda o corpo da resposta, que é a única pista do que houve", async () => {
    fingirResposta(200, JSON.stringify({ error: "instance not connected" }));
    const r = await envio();
    // Sem isto o defeito volta a ser invisível: 27 envios falharam em
    // silêncio porque o corpo era descartado.
    expect(r.detalhe).toContain("instance not connected");
  });

  it("resposta 2xx que nem é JSON também não passa como enviada", async () => {
    fingirResposta(200, "<html>Bad Gateway</html>");
    const r = await envio();
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("sem_confirmacao");
    expect(r.detalhe).toContain("html");
  });

  it("erro HTTP continua sendo erro de provedor, com o corpo junto", async () => {
    fingirResposta(400, JSON.stringify({ response: { message: [{ exists: false }] } }));
    const r = await envio();
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("erro_provedor");
    // É por este texto que `ehDestinatarioInexistente` reconhece número que
    // não está no WhatsApp — não pode se perder.
    expect(r.detalhe).toContain('"exists":false');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

/**
 * O áudio do cliente vem cifrado no webhook. Quem decifra é a Evolution
 * (`getBase64FromMediaMessage`). Só com o id ela procura a mensagem no próprio
 * banco, e a instância desta base não guarda mensagens: em 30/09/2026 todos os
 * áudios da semana voltaram HTTP 400 "Message not found". Com a mensagem
 * inteira ela decifra direto.
 */
describe("baixarMidiaDoProvedor", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    process.env.WHATSAPP_API_URL = "https://evo.exemplo";
    process.env.WHATSAPP_API_KEY = "chave";
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  const completa = {
    key: { id: "ABC", remoteJid: "5511999999999@s.whatsapp.net", fromMe: false },
    message: { audioMessage: { url: "https://mmg.whatsapp.net/x.enc", mediaKey: "k" } },
  };

  it("manda a mensagem inteira primeiro", async () => {
    const corpos: unknown[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      corpos.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ base64: "QUJD", mimetype: "audio/ogg" }), { status: 200 });
    }) as typeof fetch;
    const { baixarMidiaDoProvedor } = await import("./provider");
    const r = await baixarMidiaDoProvedor({ instanceName: "i", messageId: "ABC", mensagemCompleta: completa });
    expect(r.ok).toBe(true);
    expect(corpos).toHaveLength(1);
    expect(corpos[0]).toEqual({ message: completa, convertToMp4: false });
  });

  it("se a mensagem inteira falha, ainda tenta pelo id", async () => {
    const corpos: { message: unknown }[] = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      corpos.push(JSON.parse(String(init?.body)));
      if (corpos.length === 1) return new Response('{"message":["Message not found"]}', { status: 400 });
      return new Response(JSON.stringify({ base64: "QUJD" }), { status: 200 });
    }) as typeof fetch;
    const { baixarMidiaDoProvedor } = await import("./provider");
    const r = await baixarMidiaDoProvedor({ instanceName: "i", messageId: "ABC", mensagemCompleta: completa });
    expect(r.ok).toBe(true);
    expect(corpos[1].message).toEqual({ key: { id: "ABC" } });
  });

  it("o webhook passa a mensagem inteira", () => {
    const webhook = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
    const chamada = webhook.slice(webhook.indexOf("baixarMidiaDoProvedor({"), webhook.indexOf("baixarMidiaDoProvedor({") + 300);
    expect(chamada).toContain("mensagemCompleta: payload.data");
  });
});

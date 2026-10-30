import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { destinoDoEnvio } = await import("./provider");

/**
 * O número central respondia a partir do telefone e a resposta não aparecia
 * na conversa de quem escreveu (30/10/2026). Agora a resposta volta no mesmo
 * endereço: JID de conversa privada passa como veio.
 */
describe("destinoDoEnvio", () => {
  it("JID de conversa privada passa como veio", () => {
    expect(destinoDoEnvio("551150085875@s.whatsapp.net")).toBe("551150085875@s.whatsapp.net");
    expect(destinoDoEnvio("123456789012345@lid")).toBe("123456789012345@lid");
  });

  it("telefone segue normalizado como antes", () => {
    expect(destinoDoEnvio("11 95008-5875")).toBe("5511950085875");
    expect(destinoDoEnvio("5511950085875")).toBe("5511950085875");
  });

  it("grupo, transmissão e lixo não passam como JID", () => {
    expect(destinoDoEnvio("120363@g.us")).toBeNull();
    expect(destinoDoEnvio("status@broadcast")).toBeNull();
    expect(destinoDoEnvio("abc@lid")).toBeNull();
  });
});

describe("o central responde no endereço de onde a mensagem veio", () => {
  it("webhook.ts manda a resposta ao JID recebido (e só cai no telefone sem JID privado)", async () => {
    const { readFileSync } = await import("node:fs");
    const codigo = readFileSync("src/lib/central/webhook.ts", "utf8");
    expect(codigo).toContain("const destino = /@(s\\.whatsapp\\.net|lid)$/i.test(jid) ? jid : mensagem.telefone;");
    expect(codigo).toMatch(/enviarRespostaDoCentral\(\{ instanceName: central\.instanceName, telefone: destino \}/);
  });
});

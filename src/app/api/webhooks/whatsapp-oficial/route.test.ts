import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O webhook da API oficial (0256): falha fechada sem o segredo, assinatura
 * conferida antes de qualquer leitura, desafio do GET pelo token, e o
 * processamento DEPOIS da resposta (a Meta reenvia o que demora).
 */

const depois: (() => unknown)[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => unknown) => depois.push(fn),
}));
const supabaseFalso = { falso: true };
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => supabaseFalso }));
const guardarEventosCrus = vi.fn(async () => ["evento-1"]);
const processarEventos = vi.fn(async () => undefined);
vi.mock("@/lib/whatsapp/oficial/processarWebhook", () => ({
  guardarEventosCrus,
  processarEventos,
  resolvedorComCache: () => ({ porPhoneId: async () => null, porConta: async () => [] }),
}));

const SEGREDO = "segredo-do-app";
const CORPO = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA1",
      changes: [
        {
          field: "messages",
          value: {
            metadata: { phone_number_id: "PNID1" },
            messages: [{ from: "5511988887777", id: "wamid.A", timestamp: "1", type: "text", text: { body: "oi" } }],
          },
        },
      ],
    },
  ],
});

function assinar(corpo: string, segredo = SEGREDO): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
}

function post(corpo: string, assinatura: string | null) {
  return new Request("https://exemplo.com/api/webhooks/whatsapp-oficial", {
    method: "POST",
    body: corpo,
    headers: assinatura ? { "x-hub-signature-256": assinatura } : {},
  });
}

describe("webhook da API oficial", () => {
  beforeEach(() => {
    depois.length = 0;
    guardarEventosCrus.mockClear();
    processarEventos.mockClear();
    vi.stubEnv("WHATSAPP_OFICIAL_APP_SECRET", SEGREDO);
    vi.stubEnv("META_APP_SECRET", "");
    vi.stubEnv("WHATSAPP_OFICIAL_VERIFY_TOKEN", "token-de-verificacao");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("sem o segredo do app, recusa tudo (falha fechada)", async () => {
    vi.stubEnv("WHATSAPP_OFICIAL_APP_SECRET", "");
    const { POST } = await import("./route");
    const r = await POST(post(CORPO, assinar(CORPO)));
    expect(r.status).toBe(503);
    expect(guardarEventosCrus).not.toHaveBeenCalled();
  });

  it("assinatura ausente ou errada: 401, nada é lido", async () => {
    const { POST } = await import("./route");
    expect((await POST(post(CORPO, null))).status).toBe(401);
    expect((await POST(post(CORPO, assinar(CORPO, "outro-segredo")))).status).toBe(401);
    expect((await POST(post(CORPO, assinar("{}")))).status).toBe(401);
    expect(guardarEventosCrus).not.toHaveBeenCalled();
  });

  it("assinado certo: guarda o cru, responde 200 e processa depois", async () => {
    const { POST } = await import("./route");
    const r = await POST(post(CORPO, assinar(CORPO)));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, eventos: 1 });
    expect(guardarEventosCrus).toHaveBeenCalledTimes(1);
    // Ainda não processou: só depois da resposta.
    expect(processarEventos).not.toHaveBeenCalled();
    expect(depois).toHaveLength(1);
    await depois[0]();
    expect(processarEventos).toHaveBeenCalledWith(supabaseFalso, expect.any(Array), expect.any(Object), ["evento-1"]);
  });

  it("o desafio do GET só com o token certo", async () => {
    const { GET } = await import("./route");
    const ok = await GET(
      new Request("https://x/api/webhooks/whatsapp-oficial?hub.mode=subscribe&hub.verify_token=token-de-verificacao&hub.challenge=123"),
    );
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    const errado = await GET(
      new Request("https://x/api/webhooks/whatsapp-oficial?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=123"),
    );
    expect(errado.status).toBe(403);
    vi.stubEnv("WHATSAPP_OFICIAL_VERIFY_TOKEN", "");
    const semToken = await GET(new Request("https://x/api/webhooks/whatsapp-oficial?hub.mode=subscribe&hub.verify_token=&hub.challenge=1"));
    expect(semToken.status).toBe(403);
  });
});

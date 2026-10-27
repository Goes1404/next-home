import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listarGruposWhatsapp } from "./provider";

describe("listarGruposWhatsapp", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("WHATSAPP_API_URL", "https://evolution.exemplo.test/");
    vi.stubEnv("WHATSAPP_API_KEY", "chave-de-teste");
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
  });

  it("pede os grupos sem os participantes: a Evolution v2 exige o getParticipants na query", async () => {
    const chamadas: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      chamadas.push(String(url));
      return new Response(
        JSON.stringify([
          { id: "120363012345678901@g.us", subject: "ANDRÉ & ARETZ🟢" },
          // Grupo antigo: JID com o número de quem criou e o instante da criação.
          { id: "5511987654321-1600000000@g.us", subject: " FÁBIO & ARETZ🟢 " },
          { id: "5511987654321@s.whatsapp.net", subject: "conversa, não grupo" },
        ]),
        { status: 200 },
      );
    }) as typeof fetch;

    const r = await listarGruposWhatsapp("nexthome-administracao-aretz");

    expect(chamadas).toEqual([
      "https://evolution.exemplo.test/group/fetchAllGroups/nexthome-administracao-aretz?getParticipants=false",
    ]);
    expect(r).toEqual({
      grupos: [
        { jid: "120363012345678901@g.us", nome: "ANDRÉ & ARETZ🟢" },
        { jid: "5511987654321-1600000000@g.us", nome: "FÁBIO & ARETZ🟢" },
      ],
    });
  });

  it("HTTP de erro vira mensagem, sem lançar", async () => {
    globalThis.fetch = vi.fn(async () => new Response("x", { status: 400 })) as typeof fetch;
    const r = await listarGruposWhatsapp("central");
    expect(r.grupos).toEqual([]);
    expect(r.erro).toMatch(/400/);
  });

  it("a mensagem da Evolution vai junto do HTTP: sem ela não há como saber o motivo na tela", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ status: 500, error: "Internal Server Error", response: { message: ["Connection Closed"] } }),
          { status: 500 },
        ),
    ) as typeof fetch;
    const r = await listarGruposWhatsapp("central");
    expect(r.erro).toBe("Não foi possível ler os grupos (HTTP 500): Connection Closed");
  });

  it("tempo esgotado vira mensagem clara", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as typeof fetch;
    const r = await listarGruposWhatsapp("central");
    expect(r.erro).toMatch(/demorou demais/);
  });
});

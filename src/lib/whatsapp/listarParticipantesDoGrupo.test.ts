import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listarParticipantesDoGrupo } from "./provider";

const GRUPO = "120363000000000000@g.us";

describe("listarParticipantesDoGrupo", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("WHATSAPP_API_URL", "https://evolution.exemplo.test/");
    vi.stubEnv("WHATSAPP_API_KEY", "chave-de-teste");
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
  });

  it("chama a rota de participantes com o grupo e devolve o par número↔lid", async () => {
    const chamadas: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          participants: [{ id: "123456789012345@lid", phoneNumber: "5511987654321@s.whatsapp.net", admin: "admin" }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const r = await listarParticipantesDoGrupo("central", GRUPO);

    expect(r).toEqual({ participantes: [{ id: "123456789012345@lid", numero: "5511987654321" }] });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe(
      `https://evolution.exemplo.test/group/participants/central?groupJid=${encodeURIComponent(GRUPO)}`,
    );
    expect((chamadas[0].init?.headers as Record<string, string>).apikey).toBe("chave-de-teste");
  });

  it("HTTP de erro vira mensagem, sem lançar", async () => {
    globalThis.fetch = vi.fn(async () => new Response("x", { status: 500 })) as typeof fetch;
    const r = await listarParticipantesDoGrupo("central", GRUPO);
    expect(r.participantes).toEqual([]);
    expect(r.erro).toMatch(/500/);
  });

  it("falha de rede vira mensagem, sem lançar", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("sem rede");
    }) as typeof fetch;
    const r = await listarParticipantesDoGrupo("central", GRUPO);
    expect(r).toEqual({ participantes: [], erro: "sem rede" });
  });

  it("recusa antes de chamar a rede: sem número central ou JID que não é de grupo", async () => {
    const fetchEspiao = vi.fn();
    globalThis.fetch = fetchEspiao as unknown as typeof fetch;
    expect((await listarParticipantesDoGrupo("", GRUPO)).erro).toBeTruthy();
    expect((await listarParticipantesDoGrupo("central", "5511987654321@s.whatsapp.net")).erro).toBeTruthy();
    expect(fetchEspiao).not.toHaveBeenCalled();
  });
});

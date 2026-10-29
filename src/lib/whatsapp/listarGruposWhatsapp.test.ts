import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esquecerGruposLidos, listarGruposWhatsapp } from "./provider";

describe("listarGruposWhatsapp", () => {
  const fetchOriginal = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("WHATSAPP_API_URL", "https://evolution.exemplo.test/");
    vi.stubEnv("WHATSAPP_API_KEY", "chave-de-teste");
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.unstubAllEnvs();
    esquecerGruposLidos();
  });

  it("guarda a lista por um minuto: escolher o grupo não espera a Evolution duas vezes", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const pedido = vi.fn(
      async () => new Response(JSON.stringify([{ id: "120363012345678901@g.us", subject: "A" }]), { status: 200 }),
    );
    globalThis.fetch = pedido as typeof fetch;
    await listarGruposWhatsapp("central");
    const r = await listarGruposWhatsapp("central");
    expect(pedido).toHaveBeenCalledTimes(1);
    expect(r.grupos).toHaveLength(1);
    // "Sincronizar grupos" pede a lista nova: o número pode ter entrado num grupo agora.
    await listarGruposWhatsapp("central", { fresca: true });
    expect(pedido).toHaveBeenCalledTimes(2);
  });

  it("erro não fica guardado: a próxima leitura tenta de novo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pedido = vi.fn(async () => new Response("x", { status: 500 }));
    globalThis.fetch = pedido as typeof fetch;
    await listarGruposWhatsapp("central");
    await listarGruposWhatsapp("central");
    expect(pedido).toHaveBeenCalledTimes(2);
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

  it("grupo sem nome continua na lista: some e o seletor à mão fica sem opção", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify([{ id: "120363012345678901@g.us", subject: "" }]), { status: 200 }),
    ) as typeof fetch;
    const r = await listarGruposWhatsapp("central");
    expect(r).toEqual({ grupos: [{ jid: "120363012345678901@g.us", nome: "Grupo sem nome (…678901)" }] });
  });

  it("registra no log quantos grupos vieram e quantos ficaram: lista vazia sem erro não deixa rastro", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify([{ id: "120363012345678901@g.us", subject: "A" }, { id: "x@lid", subject: "B" }]), {
          status: 200,
        }),
    ) as typeof fetch;
    await listarGruposWhatsapp("central");
    expect(info).toHaveBeenCalledWith("[grupos] lista lida", {
      instanceName: "central",
      recebidos: 2,
      aproveitados: 1,
      descartados: ["x@lid"],
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

  it("a tela passa um prazo curto: Evolution travada não segura a aba Roleta por 90 s", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let sinal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sinal = init?.signal ?? undefined;
      await new Promise((_, rejeitar) => sinal?.addEventListener("abort", () => rejeitar(sinal?.reason)));
      return new Response("[]");
    }) as typeof fetch;
    const inicio = Date.now();
    const r = await listarGruposWhatsapp("central", { prazoMs: 50 });
    expect(Date.now() - inicio).toBeLessThan(2_000);
    expect(r.erro).toMatch(/demorou demais/);
  });
});

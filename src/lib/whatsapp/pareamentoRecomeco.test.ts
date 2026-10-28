/*
 * Pareamento depois de o WhatsApp tirar o número da conta (27/10/2026).
 *
 * O Ramos pediu código cinco vezes e todas terminaram em 401: a instância
 * guardava a sessão que o WhatsApp tinha derrubado em 21/10. Estes testes
 * conversam com uma Evolution falsa, pela rede (`fetch`), e conferem a ordem
 * dos pedidos: instância em `close` é apagada e recriada antes do código;
 * instância conectada nunca é apagada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { obterQrCodeInstancia } from "./provider";
import { FOLGA_DEPOIS_DO_CODIGO_MS, pareamentoRecusado } from "./pareamentoRecusado";

type Pedido = { metodo: string; caminho: string };

function evolutionFalsa(opcoes: {
  estado: "open" | "close" | "connecting" | null;
  /** Quantos `create` são recusados antes de aceitar (a Evolution ainda apagando). */
  createsRecusados?: number;
}) {
  const pedidos: Pedido[] = [];
  let recusasRestantes = opcoes.createsRecusados ?? 0;
  let existe = opcoes.estado !== null;

  const fetchFalso = vi.fn(async (entrada: string | URL, init?: RequestInit) => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? "GET";
    pedidos.push({ metodo, caminho: url.pathname });
    const json = (corpo: unknown, status = 200) =>
      new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

    if (url.pathname.startsWith("/instance/connectionState/")) {
      return existe ? json({ instance: { state: opcoes.estado } }) : json({ error: "not found" }, 404);
    }
    if (url.pathname.startsWith("/instance/delete/")) {
      existe = false;
      return json({ status: "SUCCESS" });
    }
    if (url.pathname.startsWith("/instance/logout/")) return json({ status: "SUCCESS" });
    if (url.pathname === "/instance/create") {
      if (existe) return json({ error: "nome em uso" }, 403);
      if (recusasRestantes > 0) {
        recusasRestantes--;
        return json({ error: "nome em uso" }, 403);
      }
      existe = true;
      return json({ instance: { state: "connecting" }, qrcode: { pairingCode: "ABCD1234", base64: null } });
    }
    if (url.pathname.startsWith("/instance/connect/")) {
      return json({ pairingCode: "ZZZZ9999" });
    }
    return json({}, 404);
  });
  return { fetchFalso, pedidos };
}

beforeEach(() => {
  vi.stubEnv("WHATSAPP_API_URL", "https://evolution.teste");
  vi.stubEnv("WHATSAPP_API_KEY", "chave");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const caminhos = (pedidos: Pedido[]) => pedidos.map((p) => `${p.metodo} ${p.caminho.replace(/\/nexthome-ramos$/, "")}`);

describe("pareamento depois de 401", () => {
  it("instância em 'close' é apagada e recriada, e o código vem da recriação", async () => {
    const { fetchFalso, pedidos } = evolutionFalsa({ estado: "close" });
    vi.stubGlobal("fetch", fetchFalso);

    const r = await obterQrCodeInstancia("nexthome-ramos", "11990024407");

    expect(caminhos(pedidos)).toEqual([
      "GET /instance/connectionState",
      "DELETE /instance/delete",
      "POST /instance/create",
    ]);
    expect(r).toMatchObject({ ok: true, codigoPareamento: "ABCD1234", desfecho: "codigo" });
  });

  it("a recriação tenta de novo se a Evolution ainda estiver apagando", async () => {
    const { fetchFalso, pedidos } = evolutionFalsa({ estado: "close", createsRecusados: 1 });
    vi.stubGlobal("fetch", fetchFalso);

    const r = await obterQrCodeInstancia("nexthome-ramos", "11990024407");

    expect(caminhos(pedidos)).toEqual([
      "GET /instance/connectionState",
      "DELETE /instance/delete",
      "POST /instance/create",
      "POST /instance/create",
    ]);
    expect(r).toMatchObject({ ok: true, codigoPareamento: "ABCD1234" });
  });

  it("o QR Code também recomeça a instância em 'close'", async () => {
    const { fetchFalso, pedidos } = evolutionFalsa({ estado: "close" });
    vi.stubGlobal("fetch", fetchFalso);

    await obterQrCodeInstancia("nexthome-ramos", null);

    expect(caminhos(pedidos).slice(0, 2)).toEqual(["GET /instance/connectionState", "DELETE /instance/delete"]);
  });

  it("número conectado nunca é apagado", async () => {
    const { fetchFalso, pedidos } = evolutionFalsa({ estado: "open" });
    vi.stubGlobal("fetch", fetchFalso);

    const r = await obterQrCodeInstancia("nexthome-ramos", "11990024407");

    expect(pedidos.some((p) => p.caminho.startsWith("/instance/delete") || p.caminho.startsWith("/instance/logout"))).toBe(
      false,
    );
    expect(r).toMatchObject({ ok: true, desfecho: "ja_conectado" });
  });

  it("QR pendente é encerrado com logout, sem apagar a instância", async () => {
    const { fetchFalso, pedidos } = evolutionFalsa({ estado: "connecting" });
    vi.stubGlobal("fetch", fetchFalso);

    await obterQrCodeInstancia("nexthome-ramos", "11990024407");

    expect(pedidos.some((p) => p.caminho.startsWith("/instance/delete"))).toBe(false);
    expect(pedidos.some((p) => p.caminho.startsWith("/instance/logout"))).toBe(true);
  });

  it("instância que não existe é só criada", async () => {
    const { fetchFalso, pedidos } = evolutionFalsa({ estado: null });
    vi.stubGlobal("fetch", fetchFalso);

    const r = await obterQrCodeInstancia("nexthome-ramos", "11990024407");

    expect(pedidos.some((p) => p.caminho.startsWith("/instance/delete"))).toBe(false);
    expect(r).toMatchObject({ ok: true, codigoPareamento: "ABCD1234" });
  });
});

describe("a tela reconhece a recusa do WhatsApp", () => {
  const codigo = "2026-10-27T19:55:00.000Z";
  const depois = (ms: number) => new Date(new Date(codigo).getTime() + ms).toISOString();

  it("401 ou 403 depois de o código aparecer é recusa", () => {
    expect(pareamentoRecusado({ pedidoEm: codigo, quedaCodigo: 401, quedaEm: depois(30_000) })).toBe(true);
    expect(pareamentoRecusado({ pedidoEm: codigo, quedaCodigo: 403, quedaEm: depois(30_000) })).toBe(true);
  });

  it("a queda do próprio recomeço, logo em seguida, não é recusa", () => {
    expect(pareamentoRecusado({ pedidoEm: codigo, quedaCodigo: 401, quedaEm: depois(FOLGA_DEPOIS_DO_CODIGO_MS - 1) })).toBe(
      false,
    );
  });

  it("queda antiga, outro código ou sem pedido não é recusa", () => {
    expect(pareamentoRecusado({ pedidoEm: codigo, quedaCodigo: 401, quedaEm: "2026-10-21T12:51:16Z" })).toBe(false);
    expect(pareamentoRecusado({ pedidoEm: codigo, quedaCodigo: 428, quedaEm: depois(30_000) })).toBe(false);
    expect(pareamentoRecusado({ pedidoEm: null, quedaCodigo: 401, quedaEm: depois(30_000) })).toBe(false);
  });
});

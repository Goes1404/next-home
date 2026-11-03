import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { cifrar, decifrar } from "./cifra";
import { decidirErroDaMeta } from "./erros";
import { chamarGraph } from "./graph";
import { categoriaDaMeta, custoEstimado, emReais, tarifaEmReais } from "./tarifas";

describe("cifra do token do cliente", () => {
  const chave = randomBytes(32).toString("base64");

  it("cifra e decifra; cada cifra sai diferente", () => {
    const a = cifrar("EAAG-token", chave);
    const b = cifrar("EAAG-token", chave);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(decifrar(a, chave)).toBe("EAAG-token");
  });

  it("chave errada ou texto adulterado não decifra", () => {
    const gravado = cifrar("EAAG-token", chave);
    expect(decifrar(gravado, randomBytes(32).toString("base64"))).toBeNull();
    const partes = gravado.split(":");
    partes[3] = Buffer.from("outra coisa").toString("base64");
    expect(decifrar(partes.join(":"), chave)).toBeNull();
    expect(decifrar("texto-puro", chave)).toBeNull();
  });

  it("chave de tamanho errado é recusada na cifra", () => {
    expect(() => cifrar("x", Buffer.from("curta").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("erros da Meta", () => {
  it("cada código cai no desfecho certo", () => {
    expect(decidirErroDaMeta({ codigo: 131026 }).tipo).toBe("definitivo");
    expect(decidirErroDaMeta({ codigo: 132000 }).tipo).toBe("definitivo");
    expect(decidirErroDaMeta({ codigo: 131049 })).toMatchObject({ tipo: "reagendar", minutos: 1440, umaVez: true });
    expect(decidirErroDaMeta({ codigo: 131050 }).tipo).toBe("optout");
    expect(decidirErroDaMeta({ codigo: 132015 }).tipo).toBe("pausar_lista");
    expect(decidirErroDaMeta({ codigo: 132001 }).tipo).toBe("pausar_lista");
    expect(decidirErroDaMeta({ codigo: 190 }).tipo).toBe("pausar_numero");
    expect(decidirErroDaMeta({ codigo: 368 }).tipo).toBe("pausar_numero");
    expect(decidirErroDaMeta({ codigo: 131042 }).tipo).toBe("pausar_numero");
    expect(decidirErroDaMeta({ codigo: 999999 }).tipo).toBe("reagendar");
  });

  it("sem resposta depois de o pedido sair é incerto: não reenvia", () => {
    expect(decidirErroDaMeta({ codigo: null, incerto: true }).tipo).toBe("incerto");
  });
});

describe("tarifas", () => {
  it("marketing pelo padrão conferido e pelo ambiente", () => {
    expect(tarifaEmReais("marketing", {})).toBe(0.3217);
    expect(tarifaEmReais("marketing", { WHATSAPP_OFICIAL_TARIFA_MARKETING: "0,35" })).toBe(0.35);
    // Valor absurdo no ambiente não vale.
    expect(tarifaEmReais("marketing", { WHATSAPP_OFICIAL_TARIFA_MARKETING: "320" })).toBe(0.3217);
    expect(custoEstimado(300, "marketing", {})).toBeCloseTo(96.51, 2);
    expect(emReais(96.51)).toBe("R$ 96,51");
  });

  it("a categoria do pricing da Meta", () => {
    expect(categoriaDaMeta("marketing")).toBe("marketing");
    expect(categoriaDaMeta("MARKETING_LITE")).toBe("marketing");
    expect(categoriaDaMeta("authentication_international")).toBe("authentication");
    expect(categoriaDaMeta("service")).toBe("service");
    expect(categoriaDaMeta(null)).toBeNull();
  });
});

describe("chamada à Graph API", () => {
  const resposta = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

  it("2xx devolve os dados; manda o token e o corpo", async () => {
    let pedido: { url: string; init: RequestInit } | null = null;
    const r = await chamarGraph<{ messages: { id: string }[] }>({
      versao: "v26.0",
      caminho: "/PNID1/messages",
      token: "TOKEN",
      corpo: { a: 1 },
      fetchImpl: (async (url: URL, init: RequestInit) => {
        pedido = { url: String(url), init };
        return resposta(200, { messages: [{ id: "wamid.X" }] });
      }) as unknown as typeof fetch,
    });
    expect(r).toEqual({ ok: true, dados: { messages: [{ id: "wamid.X" }] } });
    expect(pedido!.url).toBe("https://graph.facebook.com/v26.0/PNID1/messages");
    expect((pedido!.init.headers as Record<string, string>).Authorization).toBe("Bearer TOKEN");
    expect(pedido!.init.method).toBe("POST");
  });

  it("recusa da Meta traz o código e o detalhe", async () => {
    const r = await chamarGraph({
      versao: "v26.0",
      caminho: "PNID1/messages",
      token: "T",
      corpo: {},
      fetchImpl: (async () =>
        resposta(400, { error: { message: "(#131026) Message undeliverable", code: 131026, error_data: { details: "sem conta" } } })) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatchObject({ codigo: 131026, detalhe: "sem conta", status: 400, incerto: false });
  });

  it("rede caída é incerta (o pedido pode ter chegado)", async () => {
    const r = await chamarGraph({
      versao: "v26.0",
      caminho: "x",
      token: "T",
      corpo: {},
      fetchImpl: (async () => {
        throw new Error("timeout");
      }) as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro.incerto).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { descreverFalhaDeRede, pareamentoDaResposta } = await import("./provider");

describe("pareamentoDaResposta (create ou connect da Evolution)", () => {
  it("lê o pairingCode que o create devolve dentro de qrcode", () => {
    const r = pareamentoDaResposta({ instance: { state: "connecting" }, qrcode: { pairingCode: "WZYEH1YY", base64: "data:x" } });
    expect(r).toEqual({ base64: "data:x", codigo: "WZYEH1YY", jaConectado: false });
  });
  it("descarta o `code` longo (é a string do QR, não código digitável)", () => {
    expect(pareamentoDaResposta({ code: "2@" + "x".repeat(60) }).codigo).toBeNull();
  });
  it("estado open = já conectado", () => {
    expect(pareamentoDaResposta({ instance: { state: "open" } }).jaConectado).toBe(true);
  });
  it("resposta vazia não quebra", () => {
    expect(pareamentoDaResposta(null)).toEqual({ base64: null, codigo: null, jaConectado: false });
  });
});

describe("descreverFalhaDeRede", () => {
  it("mostra o motivo escondido em cause", () => {
    const err = new TypeError("fetch failed", { cause: { code: "ECONNRESET", message: "socket hang up" } });
    expect(descreverFalhaDeRede(err)).toBe("fetch failed — ECONNRESET — socket hang up");
  });
  it("tempo esgotado", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(descreverFalhaDeRede(err)).toBe("tempo esgotado");
  });
});

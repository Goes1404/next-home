import { describe, expect, it } from "vitest";
import { fraseSemWhatsapp, motivoDePausaAutomatica, sinaisDesdeABase } from "./pausaAutomatica";

describe("motivoDePausaAutomatica", () => {
  it("a lista da Carolini (24 sem WhatsApp em 39) para", () => {
    expect(motivoDePausaAutomatica({ enviados: 15, semWhatsapp: 24, pediramParaSair: 0 })).toMatch(/24 de 39/);
  });

  it("poucas tentativas ainda não decidem", () => {
    expect(motivoDePausaAutomatica({ enviados: 3, semWhatsapp: 5, pediramParaSair: 0 })).toBeNull();
  });

  it("números sem WhatsApp abaixo de 20% seguem", () => {
    expect(motivoDePausaAutomatica({ enviados: 114, semWhatsapp: 17, pediramParaSair: 0 })).toBeNull();
  });

  it("três pedidos para sair em 114 param a lista", () => {
    expect(motivoDePausaAutomatica({ enviados: 114, semWhatsapp: 0, pediramParaSair: 3 })).toMatch(/3 pessoas/);
  });

  it("três pedidos numa lista enorme seguem", () => {
    expect(motivoDePausaAutomatica({ enviados: 500, semWhatsapp: 0, pediramParaSair: 3 })).toBeNull();
  });

  it("dois pedidos não bastam", () => {
    expect(motivoDePausaAutomatica({ enviados: 20, semWhatsapp: 0, pediramParaSair: 2 })).toBeNull();
  });
});

describe("fraseSemWhatsapp", () => {
  it("só fala quando alguém saiu", () => {
    expect(fraseSemWhatsapp(0)).toBe("");
    expect(fraseSemWhatsapp(1)).toMatch(/1 número saiu/);
    expect(fraseSemWhatsapp(4)).toMatch(/4 números saíram/);
  });
});

describe("sinaisDesdeABase", () => {
  it("conta só o que veio depois de retomar", () => {
    expect(
      sinaisDesdeABase({ enviados: 20, semWhatsapp: 8, pediramParaSair: 3 }, { enviados: 15, semWhatsapp: 8, pediramParaSair: 3 }),
    ).toEqual({ enviados: 5, semWhatsapp: 0, pediramParaSair: 0 });
  });
  it("base ausente ou torta conta tudo", () => {
    expect(sinaisDesdeABase({ enviados: 2, semWhatsapp: 1, pediramParaSair: 0 }, null)).toEqual({ enviados: 2, semWhatsapp: 1, pediramParaSair: 0 });
  });
});

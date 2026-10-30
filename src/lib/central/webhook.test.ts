import { describe, expect, it } from "vitest";
import { lerMensagemDoCentral } from "./webhook";

const base = (data: object) => ({ event: "messages.upsert", data });

describe("lerMensagemDoCentral", () => {
  it("texto privado", () => {
    expect(
      lerMensagemDoCentral(base({ key: { id: "A1", remoteJid: "5511987654321@s.whatsapp.net" }, message: { conversation: "oi" } })),
    ).toEqual({ mensagemId: "A1", telefone: "5511987654321", lid: null, tipo: "texto", texto: "oi" });
  });

  it("grupo, transmissão e o que o próprio central mandou são ignorados", () => {
    expect(lerMensagemDoCentral(base({ key: { id: "A", remoteJid: "1203630@g.us" }, message: { conversation: "oi" } }))).toBeNull();
    expect(lerMensagemDoCentral(base({ key: { id: "A", remoteJid: "status@broadcast" }, message: { conversation: "oi" } }))).toBeNull();
    expect(
      lerMensagemDoCentral(base({ key: { id: "A", remoteJid: "5511987654321@s.whatsapp.net", fromMe: true }, message: { conversation: "oi" } })),
    ).toBeNull();
  });

  it("só o lid: guarda o lid e usa o número alternativo quando vier", () => {
    expect(
      lerMensagemDoCentral(base({ key: { id: "B", remoteJid: "999@lid", senderPn: "5511987654321@s.whatsapp.net" }, message: { conversation: "oi" } })),
    ).toMatchObject({ telefone: "5511987654321", lid: "999@lid" });
    expect(lerMensagemDoCentral(base({ key: { id: "B", remoteJid: "999@lid" }, message: { conversation: "oi" } }))).toMatchObject({
      telefone: null,
      lid: "999@lid",
    });
  });

  it("áudio, foto e documento", () => {
    const de = (message: object) => lerMensagemDoCentral(base({ key: { id: "C", remoteJid: "5511987654321@s.whatsapp.net" }, message }));
    expect(de({ audioMessage: { seconds: 5 } })?.tipo).toBe("audio");
    expect(de({ imageMessage: { caption: "ficha" } })).toMatchObject({ tipo: "imagem", texto: "ficha" });
    expect(de({ documentMessage: { fileName: "leads.xlsx" } })?.tipo).toBe("imagem");
    // Arquivo é marcado para não ser baixado como foto (onda 2); foto não.
    expect(de({ documentMessage: { fileName: "rg.pdf" } })?.documento).toBe(true);
    expect(de({ imageMessage: { caption: "ficha" } })?.documento).toBeUndefined();
  });

  it("vazio ou sem id: nada a tratar", () => {
    expect(lerMensagemDoCentral(base({ key: { id: "D", remoteJid: "5511987654321@s.whatsapp.net" }, message: { conversation: "  " } }))).toBeNull();
    expect(lerMensagemDoCentral(base({ key: { remoteJid: "5511987654321@s.whatsapp.net" }, message: { conversation: "oi" } }))).toBeNull();
  });
});

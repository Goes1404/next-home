import { describe, expect, it } from "vitest";
import { lerMensagemDeGrupoNoCentral, lerMensagemDoCentral } from "./webhook";

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

  it("arquivo: nome, tipo e tamanho declarados; com legenda chega embrulhado", () => {
    const de = (message: object) => lerMensagemDoCentral(base({ key: { id: "E", remoteJid: "5511987654321@s.whatsapp.net" }, message }));
    expect(de({ documentMessage: { fileName: "leads.xlsx", mimetype: "application/octet-stream", fileLength: "20480" } })).toMatchObject({
      documento: true,
      arquivo: { nome: "leads.xlsx", mimeType: "application/octet-stream", tamanho: 20480 },
    });
    expect(
      de({ documentWithCaptionMessage: { message: { documentMessage: { fileName: "clientes.csv", caption: "importa", fileLength: { low: 900, high: 0 } } } } }),
    ).toMatchObject({ tipo: "imagem", texto: "importa", documento: true, arquivo: { nome: "clientes.csv", tamanho: 900 } });
  });

  it("referência da mídia para baixar de novo: as chaves, sem miniatura nem legenda", () => {
    const m = lerMensagemDoCentral(
      base({
        key: { id: "F", remoteJid: "5511987654321@s.whatsapp.net" },
        message: {
          imageMessage: {
            caption: "rg do joão",
            url: "https://mmg.whatsapp.net/abc",
            directPath: "/v/abc",
            mediaKey: "Q2hhdmU=",
            mimetype: "image/jpeg",
            fileLength: "1234",
            jpegThumbnail: "/9j/4AAQSkZJRgABAQ",
          },
        },
      }),
    );
    expect(m?.midia).toEqual({
      id: "F",
      remoteJid: "5511987654321@s.whatsapp.net",
      tipo: "imageMessage",
      conteudo: { url: "https://mmg.whatsapp.net/abc", directPath: "/v/abc", mediaKey: "Q2hhdmU=", mimetype: "image/jpeg", fileLength: "1234" },
    });
    expect(JSON.stringify(m?.midia)).not.toContain("/9j/");
    // Sem as chaves da mídia não há como baixar de novo: sem referência.
    expect(lerMensagemDoCentral(base({ key: { id: "G", remoteJid: "5511987654321@s.whatsapp.net" }, message: { imageMessage: {} } }))?.midia).toBeUndefined();
  });

  it("vazio ou sem id: nada a tratar", () => {
    expect(lerMensagemDoCentral(base({ key: { id: "D", remoteJid: "5511987654321@s.whatsapp.net" }, message: { conversation: "  " } }))).toBeNull();
    expect(lerMensagemDoCentral(base({ key: { remoteJid: "5511987654321@s.whatsapp.net" }, message: { conversation: "oi" } }))).toBeNull();
  });
});

describe("lerMensagemDeGrupoNoCentral (4.1, onda 2)", () => {
  const CENTRAL = "5511968671127@s.whatsapp.net";

  it("texto com menção: o grupo, quem escreveu (lid e número) e os mencionados", () => {
    const g = lerMensagemDeGrupoNoCentral(
      base({
        key: { id: "G1", remoteJid: "120363@g.us", participant: "999@lid", participantPn: "5511987654321@s.whatsapp.net" },
        message: { extendedTextMessage: { text: "@5511968671127 como está o mês?", contextInfo: { mentionedJid: [CENTRAL] } } },
      }),
    );
    expect(g).toMatchObject({
      grupoJid: "120363@g.us",
      autor: { telefone: "5511987654321", lid: "999@lid" },
      mencionados: [CENTRAL],
      citado: null,
      mensagem: { mensagemId: "G1", tipo: "texto", texto: "@5511968671127 como está o mês?" },
    });
  });

  it("mensagem temporária (embrulhada) e resposta a uma mensagem do central", () => {
    const g = lerMensagemDeGrupoNoCentral(
      base({
        key: { id: "G2", remoteJid: "120363@g.us", participant: "5511987654321@s.whatsapp.net" },
        message: {
          ephemeralMessage: {
            message: { extendedTextMessage: { text: "e amanhã?", contextInfo: { stanzaId: "X", participant: CENTRAL, quotedMessage: {} } } },
          },
        },
      }),
    );
    expect(g).toMatchObject({ citado: CENTRAL, mencionados: [], mensagem: { texto: "e amanhã?" } });
  });

  it("o que o próprio central mandou, privado, transmissão e status não são mensagem de grupo", () => {
    const msg = { message: { conversation: "oi" } };
    expect(lerMensagemDeGrupoNoCentral(base({ key: { id: "A", remoteJid: "120363@g.us", fromMe: true }, ...msg }))).toBeNull();
    expect(lerMensagemDeGrupoNoCentral(base({ key: { id: "A", remoteJid: "5511987654321@s.whatsapp.net" }, ...msg }))).toBeNull();
    expect(lerMensagemDeGrupoNoCentral(base({ key: { id: "A", remoteJid: "status@broadcast" }, ...msg }))).toBeNull();
    expect(lerMensagemDeGrupoNoCentral(base({ key: { id: "A", remoteJid: "123@broadcast" }, ...msg }))).toBeNull();
  });
});

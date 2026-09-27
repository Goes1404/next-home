import { describe, expect, it } from "vitest";
import {
  anuncioDaEtiqueta,
  chavesDeContexto,
  ehTextoPadraoDaMeta,
  reconhecerAnuncioMeta,
} from "./anuncioMeta";
import { reconhecerConviteDeEntrada } from "./porteiro";

// Formato da Evolution v2 para uma mensagem que chegou de anúncio
// "Clique para o WhatsApp" (externalAdReply no contextInfo).
const DE_ANUNCIO = {
  event: "messages.upsert",
  data: {
    key: { id: "ABC", fromMe: false, remoteJid: "5511999990000@s.whatsapp.net" },
    message: {
      extendedTextMessage: {
        text: "Olá! Posso obter mais informações sobre isto?",
        contextInfo: {
          externalAdReply: {
            title: "Apartamento 2 dorms no Manacá",
            body: "Venha conhecer",
            sourceType: "ad",
            sourceId: "120212345678901234",
            sourceUrl: "https://www.instagram.com/p/XYZ/",
            ctwaClid: "Afc123",
          },
          conversionSource: "FB_Ads",
        },
      },
    },
  },
};

describe("anuncioDaEtiqueta", () => {
  it("lê id, título e link do anúncio", () => {
    expect(anuncioDaEtiqueta(DE_ANUNCIO)).toEqual({
      adId: "120212345678901234",
      titulo: "Apartamento 2 dorms no Manacá",
      url: "https://www.instagram.com/p/XYZ/",
      via: "etiqueta",
    });
  });

  it("acha o contextInfo que a Evolution copia para data.contextInfo", () => {
    const payload = {
      data: {
        message: { conversation: "oi" },
        contextInfo: { externalAdReply: { sourceType: "AD", sourceId: "99999999", title: "Post" } },
      },
    };
    expect(anuncioDaEtiqueta(payload)?.adId).toBe("99999999");
  });

  it("reconhece só pela fonte da conversão, sem externalAdReply", () => {
    const payload = {
      data: { message: { extendedTextMessage: { text: "oi", contextInfo: { conversionSource: "FB_Ads" } } } },
    };
    expect(anuncioDaEtiqueta(payload)).toMatchObject({ adId: null, via: "etiqueta" });
  });

  it("resposta citando mensagem comum (sem anúncio) não é anúncio", () => {
    const payload = {
      data: {
        message: {
          extendedTextMessage: {
            text: "sim",
            contextInfo: { stanzaId: "X", quotedMessage: { conversation: "vamos?" } },
          },
        },
      },
    };
    expect(anuncioDaEtiqueta(payload)).toBeNull();
  });

  it("link compartilhado com prévia (externalAdReply sem ser anúncio) não é anúncio", () => {
    const payload = {
      data: {
        message: {
          extendedTextMessage: {
            text: "olha isso",
            contextInfo: { externalAdReply: { title: "Notícia", sourceType: "link" } },
          },
        },
      },
    };
    expect(anuncioDaEtiqueta(payload)).toBeNull();
  });

  it("id que não é só dígitos vira null", () => {
    const payload = {
      data: { contextInfo: { externalAdReply: { sourceType: "ad", sourceId: "[object Object]" } } },
    };
    expect(anuncioDaEtiqueta(payload)?.adId).toBeNull();
  });
});

describe("texto padrão da Meta", () => {
  it.each([
    "Olá! Posso obter mais informações sobre isto?",
    "olá, posso obter mais informações sobre isso",
    "Hello! Can I get more info on this?",
  ])("reconhece %s", (t) => expect(ehTextoPadraoDaMeta(t)).toBe(true));

  it.each(["oi", "Olá!", "posso obter mais informações sobre o jantar de domingo?", ""])(
    "não reconhece %s",
    (t) => expect(ehTextoPadraoDaMeta(t)).toBe(false),
  );

  it("sem etiqueta, o texto padrão identifica o impulsionamento sem id", () => {
    expect(
      reconhecerAnuncioMeta({ payload: {}, texto: "Olá! Posso obter mais informações sobre isto?" }),
    ).toEqual({ adId: null, titulo: null, url: null, via: "texto_padrao" });
  });
});

describe("o anúncio abre a porta da 0111", () => {
  it("vira convite, e o nosso link continua tendo prioridade", () => {
    const anuncio = reconhecerAnuncioMeta({ payload: DE_ANUNCIO, texto: "oi" });
    expect(
      reconhecerConviteDeEntrada({ texto: "oi", palavrasEntradaCliente: null, anuncio }),
    ).toMatchObject({ via: "anuncio_meta" });
    expect(
      reconhecerConviteDeEntrada({
        texto: "Olá! Gostaria de mais informações do Manacá.",
        palavrasEntradaCliente: null,
        anuncio,
      }),
    ).toMatchObject({ via: "mensagem_do_anuncio" });
  });

  it("conversa pessoal sem etiqueta continua sem convite", () => {
    const anuncio = reconhecerAnuncioMeta({ payload: { data: {} }, texto: "oi mãe" });
    expect(anuncio).toBeNull();
    expect(reconhecerConviteDeEntrada({ texto: "oi mãe", palavrasEntradaCliente: null, anuncio })).toBeNull();
  });
});

describe("chavesDeContexto", () => {
  it("devolve só os nomes, nunca o conteúdo", () => {
    expect(chavesDeContexto(DE_ANUNCIO)).toEqual(["conversionSource", "externalAdReply"]);
  });
});

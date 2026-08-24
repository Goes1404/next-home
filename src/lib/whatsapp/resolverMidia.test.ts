import { describe, expect, it } from "vitest";

import { anexarLinkDoCatalogo, midiasJaEnviadas, resolverAnexos } from "./resolverMidia";
import type { Empreendimento } from "@/lib/types";

/*
 * O loop de fotos que o corretor viu em produção: a IA mandava as mesmas
 * imagens a cada duas ou três mensagens e a conversa não andava. O prompt já
 * pedia para não repetir — instrução de prompt é probabilística. Estes testes
 * trancam a garantia determinística.
 */

const canvas = {
  nome: "Canvas Alphaville",
  slug: "canvas-alphaville",
  midias: [
    { url: "https://cdn.exemplo/a.jpg", tipo: "foto", alt: "sala" },
    { url: "https://cdn.exemplo/b.jpg", tipo: "foto", alt: "cozinha" },
    { url: "https://cdn.exemplo/c.jpg", tipo: "foto", alt: "varanda" },
  ],
  plantas: [],
  videos: [],
} as unknown as Empreendimento;

describe("midiasJaEnviadas", () => {
  it("lê do histórico as URLs que o bot já anexou", () => {
    const enviadas = midiasJaEnviadas([
      { remetente: "cliente", texto: "manda foto" },
      {
        remetente: "bot",
        texto:
          "Claro!\n\n📎 foto — Canvas: https://cdn.exemplo/a.jpg\n📎 foto — Canvas: https://cdn.exemplo/b.jpg",
      },
    ]);
    expect(enviadas).toEqual(new Set(["https://cdn.exemplo/a.jpg", "https://cdn.exemplo/b.jpg"]));
  });

  it("só conta o que o BOT mandou — anexo do cliente não é envio nosso", () => {
    const enviadas = midiasJaEnviadas([
      { remetente: "cliente", texto: "📎 foto: https://cdn.exemplo/z.jpg" },
    ]);
    expect(enviadas.size).toBe(0);
  });

  it("conversa sem anexo nenhum devolve conjunto vazio", () => {
    expect(midiasJaEnviadas([{ remetente: "bot", texto: "Oi! Tudo bem?" }]).size).toBe(0);
  });
});

describe("resolverAnexos com dedupe", () => {
  it("avança para a foto INÉDITA em vez de repetir as já enviadas", () => {
    const { anexos, repetidos } = resolverAnexos(
      [{ slug: "canvas-alphaville", tipo: "foto", quantidade: 1 }],
      [canvas],
      new Set(["https://cdn.exemplo/a.jpg", "https://cdn.exemplo/b.jpg"]),
    );
    expect(anexos.map((a) => a.url)).toEqual(["https://cdn.exemplo/c.jpg"]);
    expect(repetidos).toBe(2);
  });

  it("não manda nada quando todas já saíram, e diz por quê", () => {
    const { anexos, pedidosSemMidia } = resolverAnexos(
      [{ slug: "canvas-alphaville", tipo: "foto", quantidade: 3 }],
      [canvas],
      new Set(["https://cdn.exemplo/a.jpg", "https://cdn.exemplo/b.jpg", "https://cdn.exemplo/c.jpg"]),
    );
    expect(anexos).toHaveLength(0);
    expect(pedidosSemMidia[0]).toContain("já enviada nesta conversa");
  });

  it("sem histórico, se comporta como antes", () => {
    const { anexos, repetidos } = resolverAnexos(
      [{ slug: "canvas-alphaville", tipo: "foto", quantidade: 2 }],
      [canvas],
    );
    expect(anexos).toHaveLength(2);
    expect(repetidos).toBe(0);
  });
});

describe("Link do catálogo do corretor", () => {
  const CERTO = "https://next-home-drab.vercel.app/?corretor=cristal-bruna";

  /*
   * O eval mediu: com o prompt mandando "copie o endereço exatamente", a IA
   * mandava o link em cerca de METADE das rodadas. Link de atribuição
   * intermitente é pior que nenhum — a falha não aparece.
   */
  it("anexa o link quando a IA pediu e não escreveu nada", () => {
    const r = anexarLinkDoCatalogo("Dá uma olhada e me diz o que te agradou.", "cristal-bruna");
    expect(r.anexou).toBe(true);
    expect(r.texto).toContain(CERTO);
  });

  it("não duplica quando o link certo já está no texto", () => {
    const texto = `Dá uma olhada --- ${CERTO}`;
    expect(anexarLinkDoCatalogo(texto, "cristal-bruna")).toEqual({ texto, anexou: false });
  });

  /* Slug errado leva a uma home sem vínculo e a atribuição do lead se perde. */
  it("corrige link que a IA inventou com slug errado", () => {
    const r = anexarLinkDoCatalogo(
      "Olha aqui: https://next-home-drab.vercel.app/?corretor=bruna-cristal",
      "cristal-bruna",
    );
    expect(r.anexou).toBe(true);
    expect(r.texto).toContain(CERTO);
    expect(r.texto).not.toContain("bruna-cristal");
  });

  /* Sem slug, `/?corretor=` truncado é pior que não mandar nada. */
  it("não inventa link para corretor sem slug", () => {
    const texto = "Dá uma olhada nas opções.";
    expect(anexarLinkDoCatalogo(texto, null)).toEqual({ texto, anexou: false });
    expect(anexarLinkDoCatalogo(texto, "  ")).toEqual({ texto, anexou: false });
  });
});

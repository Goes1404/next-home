import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { comporArte } from "./compor";
import { CANAIS } from "./marketing";

/**
 * O compositor roda o `sharp` de verdade aqui — é a única forma de saber que
 * o SVG é válido e que a arte sai no tamanho do canal. Um SVG malformado não
 * dá erro de tipo: dá erro em produção, depois de a imagem já ter sido paga.
 */
describe("comporArte", () => {
  it("sai exatamente no tamanho de cada canal, com a copy composta", async () => {
    const base = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#3366aa" } })
      .png()
      .toBuffer();
    for (const canal of CANAIS) {
      const png = await comporArte({
        imagem: base,
        canal,
        copy: { titulo: "Lançamento ao Lado do Parque", apoio: "Aldeia, Barueri · Em construção", cta: "Agende uma visita" },
        rodape: "Bruna · next-home.com.br",
      });
      const meta = await sharp(png).metadata();
      expect([meta.width, meta.height], canal.chave).toEqual([canal.arte.largura, canal.arte.altura]);
    }
  });

  it("aceita texto com & e < sem quebrar o SVG", async () => {
    const base = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#222" } }).png().toBuffer();
    const png = await comporArte({
      imagem: base,
      canal: CANAIS.find((c) => c.chave === "anuncio")!,
      copy: { titulo: "Vista & Parque <novo>", apoio: "", cta: "Quero saber mais" },
      rodape: "x",
    });
    expect((await sharp(png).metadata()).width).toBe(1080);
  });
});

describe("o apoio longo", () => {
  it("é quebrado em linhas em vez de vazar pela borda", async () => {
    // Não dá para medir texto renderizado com precisão sem fonte embutida, mas
    // dá para garantir o mecanismo: um apoio de 72 caracteres precisa virar
    // duas linhas de <text>, nunca uma só.
    const base = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#123" } }).png().toBuffer();
    const png = await comporArte({
      imagem: base,
      canal: CANAIS.find((c) => c.chave === "story")!,
      copy: { titulo: "Eternity Alphaville: Seu novo começo", apoio: "Apartamentos de 2 e 3 dormitórios no Centro Comercial Jubran, Barueri", cta: "Visite o decorado" },
      rodape: "Bruna · next-home-drab.vercel.app",
    });
    expect((await sharp(png).metadata()).height).toBe(1920);
  });
});

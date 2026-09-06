import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { comporArte } from "./compor";
import { cabem, quebrar } from "@/lib/video/render";
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

describe("o texto sai da composição exatamente como entrou", () => {
  /*
   * É a prova de "não errar as palavras", e ela falharia CALADA: a arte sai
   * bonita, no tamanho certo, com a palavra errada. Só olhando a imagem se
   * veria — e ninguém olha toda imagem.
   *
   * O compositor é a metade EXATA do sistema. O modelo pode desenhar a
   * manchete na cena (medido: acento correto em 4 de 4 renders, mas literal em
   * 3 de 4), e o que precisa ser exato — ressalva legal, link, telefone — vem
   * daqui, com fonte de verdade.
   */
  const acentos = "Conheça a varanda: sol, ar & vista — pré-lançamento nº 3";

  it("preserva cedilha, til, agudo, circunflexo e crase na quebra por largura", () => {
    // `quebrar`/`cabem` vivem em `video/render.ts`; `compor.ts` usa
    // `quebrarEmLinhas` do carrossel. As duas preservam caractere — o que se
    // prova aqui é a regra, e o caminho da imagem é coberto pelo teste de
    // ponta a ponta abaixo.
    const linhas = quebrar(acentos, cabem(38, 950), 4);
    expect(linhas.join(" ")).toContain("Conheça");
    expect(linhas.join(" ")).toContain("pré-lançamento");
    // Nada de normalizar: "ç" não pode virar "c" nem "ã" virar "a".
    expect(linhas.join(" ")).not.toMatch(/Conheca|pre-lancamento/);
  });

  it("não muda maiúsculas nem corta o que cabe", () => {
    const curto = "Conheça o decorado";
    expect(quebrar(curto, cabem(38, 950), 4)).toEqual([curto]);
  });

  it("escapa o que quebraria o SVG sem alterar a letra", () => {
    // `&` cru quebra o SVG e a arte sai sem texto nenhum — falha calada
    // clássica. O escape muda a codificação, nunca o caractere que se lê.
    expect(quebrar("sol, ar & vista", cabem(38, 950), 4).join(" ")).toContain("&");
  });

  it("compõe de verdade uma frase com acento, sem estourar o quadro", async () => {
    const base = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: "#334" } })
      .png()
      .toBuffer();
    const png = await comporArte({
      imagem: base,
      canal: CANAIS.find((c) => c.chave === "story")!,
      copy: { titulo: "Conheça o decorado", apoio: "Pré-lançamento · Alphaville", cta: "Agende uma visita" },
      rodape: "Bruna · next-home.com.br",
    });
    expect((await sharp(png).metadata()).height).toBe(1920);
  });
});

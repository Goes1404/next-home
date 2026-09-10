import { describe, expect, it } from "vitest";
import { RESSALVA } from "./marketing";
import { TAMANHOS } from "./imagensTipos";
import { carimbarRessalva, linhaDoTexto, reguaDoCarimbo, svgDaRessalva } from "./carimbo";

/**
 * O carimbo da ressalva legal.
 *
 * Metade disto é geometria pura e roda sem nada instalado; a outra metade
 * exercita o `sharp` DE VERDADE, com uma imagem criada na hora. É o único
 * jeito de saber que a composição não estoura — a régua da casa é que guarda
 * nunca provocada é só otimismo, e aqui o modo de falhar (`carimbada: false`)
 * é justamente o que passaria despercebido.
 */

describe("a régua sai da largura, nunca de número chumbado", () => {
  it("na base de 1024 a ressalva cabe no tamanho ideal", () => {
    const r = reguaDoCarimbo(1024);
    expect(r.fonte).toBe(18);
    expect(r.margem).toBe(24);
    expect(r.faixa).toBeGreaterThan(r.fonte);
  });

  it("formato maior escala junto — a ressalva não vira formiga no 1536", () => {
    expect(reguaDoCarimbo(1536).fonte).toBeGreaterThan(reguaDoCarimbo(1024).fonte);
  });

  /*
   * Limite de CARACTERES não é limite de LARGURA. A primeira arte de story
   * desta base vazou pela direita ("…Centro Comercial Jub") porque alguém
   * contou caracteres onde a conta é de largura. Aqui o texto encolhe.
   */
  it("texto longo ENCOLHE até caber na linha", () => {
    const longo = "x".repeat(120);
    const r = reguaDoCarimbo(1024, longo);
    expect(r.fonte).toBeLessThan(18);
    expect(r.cabe).toBe(true);
    expect(longo.length * r.fonte * 0.56).toBeLessThanOrEqual(1024 - 2 * r.margem);
  });

  /*
   * O piso de leitura e o "cabe numa linha" se contradizem para texto muito
   * longo. A saída honesta é a régua DIZER que não coube, em vez de fingir —
   * truncar seria pior, porque é aviso legal e meia frase afirma outra coisa.
   */
  it("abaixo do piso a fonte para e a régua ADMITE que não coube", () => {
    const r = reguaDoCarimbo(1024, "x".repeat(5000));
    expect(r.fonte).toBe(11);
    expect(r.cabe).toBe(false);
  });

  /*
   * A invariante que de fato protege a produção: a ressalva REAL cabe em todo
   * formato que a tela oferece. Se alguém alongar o texto ou entrar com um
   * formato mais estreito, é aqui que aparece — e não numa peça publicada.
   */
  it.each(TAMANHOS)("a RESSALVA cabe no formato $chave", (t) => {
    expect(reguaDoCarimbo(t.largura).cabe).toBe(true);
    expect(reguaDoCarimbo(t.largura).fonte).toBeGreaterThanOrEqual(14);
  });
});

describe("o SVG", () => {
  it("leva a ressalva literal, e ela sai da fonte de verdade", () => {
    expect(svgDaRessalva(1024, 1024)).toContain(RESSALVA);
    expect(RESSALVA).toBe("Imagem gerada por IA, meramente ilustrativa.");
  });

  it("desenha a faixa escura — sem ela o texto some numa foto de céu claro", () => {
    expect(svgDaRessalva(1024, 1024)).toContain("linearGradient");
  });

  it("fica DENTRO da imagem, encostado na base", () => {
    const svg = svgDaRessalva(1024, 1536);
    const y = Number(/<rect x="0" y="(\d+)"/.exec(svg)?.[1]);
    const altura = Number(/<rect [^>]*height="(\d+)"/.exec(svg)?.[1]);
    expect(y + altura).toBe(1536);
  });

  it("escapa o que quebraria o XML", () => {
    expect(svgDaRessalva(1024, 1024, "A & B <c>")).toContain("A &amp; B &lt;c&gt;");
  });
});

describe("carimbar de verdade, com sharp", () => {
  async function imagemDeTeste(largura: number, altura: number): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return sharp({
      create: { width: largura, height: altura, channels: 3, background: "#88aacc" },
    })
      .png()
      .toBuffer();
  }

  it("devolve uma imagem DIFERENTE, do mesmo tamanho", async () => {
    const sharp = (await import("sharp")).default;
    const original = await imagemDeTeste(1024, 1024);

    const r = await carimbarRessalva(original);

    expect(r.carimbada).toBe(true);
    expect(r.bytes.equals(original)).toBe(false);

    const meta = await sharp(r.bytes).metadata();
    expect(meta.width).toBe(1024);
    expect(meta.height).toBe(1024);
  });

  it("escurece o rodapé e não encosta no topo", async () => {
    const sharp = (await import("sharp")).default;
    const r = await carimbarRessalva(await imagemDeTeste(1024, 1024));

    const px = async (x: number, y: number) => {
      const bruto = await sharp(r.bytes)
        .extract({ left: x, top: y, width: 1, height: 1 })
        .raw()
        .toBuffer();
      return bruto[0] + bruto[1] + bruto[2];
    };

    // O véu só toca a base: o assunto da peça continua intacto.
    expect(await px(512, 1000)).toBeLessThan(await px(512, 40));
  });

  /*
   * A guarda que de fato protege: CONTRASTE, medido sobre BRANCO PURO.
   *
   * O pior caso não é imaginário — é uma fachada com céu estourado, e é o
   * enquadramento mais comum que esta tela gera. A primeira versão deste
   * carimbo dava 2,08:1 ali (abaixo de AA) e passou no olho, porque a amostra
   * que eu tinha desenhado usava fundo cinza-claro. Ninguém julga contraste
   * de olho; mede-se.
   */
  it("o texto tem contraste AA sobre o pior fundo possível (branco)", async () => {
    const sharp = (await import("sharp")).default;
    const branco = await sharp({
      create: { width: 1024, height: 1024, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();

    const r = await carimbarRessalva(branco);
    expect(r.carimbada).toBe(true);

    // Uma linha de 1px na altura do miolo das letras.
    const { data, info } = await sharp(r.bytes)
      .extract({ left: 0, top: linhaDoTexto(1024, 1024), width: 700, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const luminancia = (r0: number, g: number, b: number) => {
      const f = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(r0) + 0.7152 * f(g) + 0.0722 * f(b);
    };

    let letra = 0;
    let veu = 1;
    for (let i = 0; i < data.length; i += info.channels) {
      const l = luminancia(data[i], data[i + 1], data[i + 2]);
      if (l > letra) letra = l; // o mais claro da linha é o miolo da letra
      if (l < veu) veu = l; // o mais escuro é o véu ao redor dela
    }

    const contraste = (letra + 0.05) / (veu + 0.05);
    expect(contraste, `contraste de ${contraste.toFixed(2)}:1 — o mínimo AA é 4,5`).toBeGreaterThanOrEqual(4.5);
  });

  /*
   * O modo de falhar é o que precisa ser exercitado: a imagem JÁ FOI PAGA
   * quando isto roda, então recusar queimaria o dinheiro. Bytes que não são
   * imagem voltam como vieram, com `carimbada: false` — que é o sinal de que
   * a tela tem de avisar o corretor.
   */
  it("bytes ilegíveis voltam como vieram, sem lançar", async () => {
    const lixo = Buffer.from("isto não é uma imagem");
    const r = await carimbarRessalva(lixo);
    expect(r.carimbada).toBe(false);
    expect(r.bytes.equals(lixo)).toBe(true);
  });
});

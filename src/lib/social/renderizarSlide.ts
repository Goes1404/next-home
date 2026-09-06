import "server-only";

import { ALTURA, LARGURA, type Slide } from "./carrossel";

/**
 * Desenha um slide do carrossel.
 *
 * ## `sharp` sob demanda, sempre
 *
 * O binário nativo é carregado por `await import` e guardado em cache. Não
 * é preciosismo: neste projeto uma dependência nativa importada no TOPO do
 * módulo derrubou a página inteira do editor de imóveis, e o erro acontece
 * antes de qualquer `try/catch`. O pior caso aqui é o corretor não
 * conseguir gerar a imagem — nunca uma tela em branco.
 *
 * ## O layout é CARTÃO, e a razão foi medida
 *
 * Nenhuma foto do catálogo passa de 1000px e a maioria é paisagem
 * (1000×562). O post é 1080×1350, em pé. Foto sangrada exigiria cortar dois
 * terços da imagem. A faixa de foto com tipografia em volta cabe sem
 * destruir o enquadramento — e sai com a cara da casa.
 *
 * ## Fonte
 *
 * O texto é desenhado por SVG, e a fonte é a que existir no runtime. Não
 * embutimos arquivo de fonte de propósito: seria +200KB na função por um
 * ganho que o feed do Instagram, comprimido e visto no celular, quase não
 * mostra. Se um dia a marca exigir a tipografia exata, é aqui que ela entra.
 */

/** Espelha os tokens de `globals.css`. Duas paletas divergiriam. */
const COR = {
  fundo: "#040b0a",
  superficie: "#0b1a17",
  titulo: "#f6faf9",
  corpo: "#dbe6e3",
  acento: "#2fd6a4",
} as const;

const FAIXA_FOTO = { topo: 168, altura: 760 };

type Sharp = (typeof import("sharp"))["default"];
let sharpCache: Sharp | null = null;

async function carregarSharp(): Promise<Sharp> {
  if (!sharpCache) sharpCache = (await import("sharp")).default;
  return sharpCache;
}

/** `&` e `<` quebram o SVG — e nome de imóvel tem "&" com frequência. */
function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Quebra o título em até duas linhas.
 *
 * Sem isto, "Lançamento ao Lado do Parque" sai numa linha só e vaza da
 * arte. SVG não quebra texto sozinho — quem decide onde cortar é quem
 * escreve.
 */
export function quebrarEmLinhas(texto: string, maxPorLinha: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";

  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (tentativa.length <= maxPorLinha) {
      atual = tentativa;
    } else {
      if (atual) linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);

  if (linhas.length <= 2) return linhas;
  // Mais de duas linhas não cabe: junta o resto e corta.
  const resto = linhas.slice(1).join(" ");
  return [linhas[0], `${resto.slice(0, maxPorLinha - 1).trimEnd()}…`];
}

/**
 * A arte do slide, em SVG.
 *
 * `temFoto` chega por PARÂMETRO, e não de `slide.foto`: quem sabe se a foto
 * existe de verdade é quem a baixou. Derivar do objeto do catálogo fazia o
 * texto se posicionar como se não houvesse foto enquanto o compositor
 * desenhava uma — e o retângulo de fundo cobria a imagem inteira. Custou
 * uma renderização para descobrir, e foi a conferência de mecanismo que
 * pegou.
 */
function svgDoSlide(slide: Slide, indice: number, total: number, temFoto: boolean): string {
  // Com foto o texto vive na faixa de baixo; sem foto, um pouco acima do
  // centro óptico — no meio exato ele parece caído.
  const baseY = temFoto ? FAIXA_FOTO.topo + FAIXA_FOTO.altura + 108 : ALTURA / 2 - 60;
  const tamanhoTitulo = slide.tipo === "capa" || !temFoto ? 76 : 52;
  const linhas = quebrarEmLinhas(slide.titulo, tamanhoTitulo > 60 ? 20 : 30);

  const titulo = linhas
    .map(
      (linha, i) =>
        `<text x="80" y="${baseY + i * (tamanhoTitulo + 12)}" font-family="sans-serif" font-size="${tamanhoTitulo}" font-weight="700" fill="${COR.titulo}">${escapar(linha)}</text>`,
    )
    .join("");

  const apoio = slide.apoio
    ? `<text x="80" y="${baseY + linhas.length * (tamanhoTitulo + 12) + 22}" font-family="sans-serif" font-size="34" fill="${COR.corpo}">${escapar(slide.apoio)}</text>`
    : "";

  /*
   * Com foto, o fundo é pintado só ACIMA e ABAixo da faixa — a área da
   * imagem fica transparente. Um retângulo de tela cheia aqui apaga a foto,
   * porque o SVG é a camada de cima.
   */
  const fundo = temFoto
    ? `<rect width="${LARGURA}" height="${FAIXA_FOTO.topo}" fill="${COR.fundo}"/>` +
      `<rect y="${FAIXA_FOTO.topo + FAIXA_FOTO.altura}" width="${LARGURA}" height="${ALTURA - FAIXA_FOTO.topo - FAIXA_FOTO.altura}" fill="${COR.fundo}"/>`
    : `<rect width="${LARGURA}" height="${ALTURA}" fill="${COR.superficie}"/>`;

  return `<svg width="${LARGURA}" height="${ALTURA}" xmlns="http://www.w3.org/2000/svg">
  ${fundo}
  <text x="80" y="96" font-family="sans-serif" font-size="26" font-weight="700" letter-spacing="6" fill="${COR.acento}">NEXT HOME</text>
  ${titulo}
  ${apoio}
  <text x="${LARGURA - 80}" y="${ALTURA - 70}" text-anchor="end" font-family="sans-serif" font-size="24" fill="${COR.acento}">${indice + 1}/${total}</text>
</svg>`;
}

/**
 * Um slide em PNG.
 *
 * `fotoBaixada` vem de fora porque baixar é I/O de rede e este módulo já
 * carrega binário nativo — misturar as duas coisas tornaria o erro de rede
 * indistinguível do erro de decodificação.
 */
export async function renderizarSlide(params: {
  slide: Slide;
  indice: number;
  total: number;
  fotoBaixada: Buffer | null;
}): Promise<Buffer> {
  const sharp = await carregarSharp();
  const { slide, indice, total, fotoBaixada } = params;

  const camadas: { input: Buffer; top: number; left: number }[] = [];

  if (fotoBaixada) {
    /*
     * `cover` corta o excesso em vez de esticar. Com origem 16:9 numa faixa
     * 1080×760 a perda é pequena e sempre nas laterais — nunca no assunto,
     * que em foto de imóvel fica no centro.
     */
    const foto = await sharp(fotoBaixada)
      .resize(LARGURA, FAIXA_FOTO.altura, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    camadas.push({ input: foto, top: FAIXA_FOTO.topo, left: 0 });
  }

  camadas.push({
    input: Buffer.from(svgDoSlide(slide, indice, total, Boolean(fotoBaixada))),
    top: 0,
    left: 0,
  });

  return sharp({
    create: {
      width: LARGURA,
      height: ALTURA,
      channels: 4,
      background: fotoBaixada ? COR.fundo : COR.superficie,
    },
  })
    .composite(camadas)
    .png()
    .toBuffer();
}

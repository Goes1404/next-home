import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { quebrarEmLinhas } from "@/lib/social/renderizarSlide";
import { RESSALVA, type Canal, type Copy } from "./marketing";

/**
 * Compõe a arte final: imagem gerada + marca + copy + ressalva, no tamanho
 * do canal, fora das zonas mortas.
 *
 * É o passo que o ChatGPT não dá. A imagem que sai de lá ainda precisa de
 * Canva; a que sai daqui vai direto para o story, o feed, o anúncio ou o
 * disparo — com a logo de verdade, o nome de verdade do empreendimento e a
 * chamada permitida, escritos por CÓDIGO em vez de "desenhados" pelo modelo
 * (que escreve torto e inventa placa).
 *
 * `sharp` sob demanda, como em `renderizarSlide.ts`: binário nativo no topo do
 * módulo já derrubou uma tela inteira nesta base.
 *
 * Fonte: a do runtime (sans-serif), a mesma escolha do carrossel. Se a marca
 * exigir tipografia própria um dia, é aqui que ela entra — com o cuidado de
 * que `librsvg` na Vercel precisa de `fontconfig` apontando para o arquivo.
 */

/** Espelha os tokens da marca em `globals.css`. */
const COR = {
  fundo: "#040b0a",
  titulo: "#f6faf9",
  corpo: "#dbe6e3",
  acento: "#2fd6a4",
  sobreAcento: "#04201a",
} as const;

const MARGEM = 72;

type Sharp = (typeof import("sharp"))["default"];
let sharpCache: Sharp | null = null;
async function carregarSharp(): Promise<Sharp> {
  if (!sharpCache) sharpCache = (await import("sharp")).default;
  return sharpCache;
}

let logoCache: Buffer | null = null;
async function carregarLogo(): Promise<Buffer | null> {
  if (logoCache) return logoCache;
  try {
    logoCache = await readFile(join(process.cwd(), "public", "marca", "logo-original.png"));
    return logoCache;
  } catch {
    return null; // sem logo a arte sai com o nome da marca em texto
  }
}

function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * A camada de texto. Tudo ancorado na BASE, subindo: ressalva → rodapé →
 * chamada → apoio → título. Ancorar na base é o que garante que a copy
 * fique acima da zona morta do story, seja qual for o número de linhas.
 */
function svgDaCopy(params: {
  canal: Canal;
  copy: Copy;
  rodape: string;
  temLogo: boolean;
}): string {
  const { canal, copy, rodape, temLogo } = params;
  const W = canal.arte.largura;
  const H = canal.arte.altura;
  const largo = W - 2 * MARGEM;

  // Escala com a largura: 1080 é a base de tudo.
  const tTitulo = copy.titulo.length > 22 ? 64 : 76;
  const tApoio = 34;
  const tCta = 30;
  const tRodape = 24;
  const tRessalva = 18;

  // Quantos caracteres cabem numa linha desta largura e tamanho. 0,56em por
  // caractere é a média medida da sans-serif do runtime (DejaVu) em texto
  // corrido. Limite de CARACTERES não é limite de LARGURA: a primeira arte
  // de story saiu com o apoio vazando pela direita ("…Centro Comercial Jub")
  // porque 62 caracteres a 34px são ~1.160px numa caixa de 936.
  const cabem = (tamanho: number) => Math.max(8, Math.floor(largo / (tamanho * 0.56)));

  const linhasTitulo = quebrarEmLinhas(copy.titulo, cabem(tTitulo));
  const linhasApoio = copy.apoio ? quebrarEmLinhas(copy.apoio, cabem(tApoio)) : [];

  // De baixo para cima.
  let y = H - canal.zonaMorta.base - MARGEM;
  const ressalvaY = y;
  y -= tRessalva + 14;
  const rodapeY = y;
  y -= tRodape + 26;
  const ctaAltura = tCta + 28;
  const ctaY = y - ctaAltura;
  y = ctaY - 30;
  // A base da ÚLTIMA linha do apoio; as anteriores sobem a partir dela.
  const apoioBaseY = y;
  y = linhasApoio.length > 0 ? apoioBaseY - linhasApoio.length * (tApoio + 8) - 6 : y + tApoio;
  const tituloBaseY = y;

  const ctaLargura = Math.min(largo, Math.round(copy.cta.length * tCta * 0.62 + 64));

  const titulo = linhasTitulo
    .map((l, i) => {
      const yy = tituloBaseY - (linhasTitulo.length - 1 - i) * (tTitulo + 10);
      return `<text x="${MARGEM}" y="${yy}" font-family="sans-serif" font-size="${tTitulo}" font-weight="700" fill="${COR.titulo}">${escapar(l)}</text>`;
    })
    .join("");

  const apoio = linhasApoio
    .map((l, i) => {
      const yy = apoioBaseY - (linhasApoio.length - 1 - i) * (tApoio + 8);
      return `<text x="${MARGEM}" y="${yy}" font-family="sans-serif" font-size="${tApoio}" fill="${COR.corpo}">${escapar(l)}</text>`;
    })
    .join("");

  const cta =
    `<rect x="${MARGEM}" y="${ctaY}" width="${ctaLargura}" height="${ctaAltura}" rx="${ctaAltura / 2}" fill="${COR.acento}"/>` +
    `<text x="${MARGEM + ctaLargura / 2}" y="${ctaY + ctaAltura / 2 + tCta * 0.36}" text-anchor="middle" font-family="sans-serif" font-size="${tCta}" font-weight="700" fill="${COR.sobreAcento}">${escapar(copy.cta)}</text>`;

  const rodapeSvg = `<text x="${MARGEM}" y="${rodapeY}" font-family="sans-serif" font-size="${tRodape}" fill="${COR.corpo}" opacity="0.9">${escapar(rodape)}</text>`;
  const ressalvaSvg = `<text x="${MARGEM}" y="${ressalvaY}" font-family="sans-serif" font-size="${tRessalva}" fill="${COR.corpo}" opacity="0.65">${escapar(RESSALVA)}</text>`;

  // Véu escuro na base, onde vive o texto. Começa acima do título para o
  // contraste valer nas duas linhas — e vai até a borda, cobrindo a zona morta.
  const veuTopo = Math.max(0, tituloBaseY - linhasTitulo.length * (tTitulo + 10) - 120);
  const veu =
    `<defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${COR.fundo}" stop-opacity="0"/>` +
    `<stop offset="0.35" stop-color="${COR.fundo}" stop-opacity="0.72"/>` +
    `<stop offset="1" stop-color="${COR.fundo}" stop-opacity="0.94"/>` +
    `</linearGradient></defs>` +
    `<rect x="0" y="${veuTopo}" width="${W}" height="${H - veuTopo}" fill="url(#v)"/>`;

  // Sem logo, a marca vai em texto no canto — nunca sem marca.
  const marcaTexto = temLogo
    ? ""
    : `<text x="${MARGEM}" y="${canal.zonaMorta.topo + MARGEM + 26}" font-family="sans-serif" font-size="26" font-weight="700" letter-spacing="6" fill="${COR.acento}">NEXT HOME</text>`;

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${veu}${marcaTexto}${titulo}${apoio}${cta}${rodapeSvg}${ressalvaSvg}</svg>`;
}

export async function comporArte(params: {
  imagem: Buffer;
  canal: Canal;
  copy: Copy;
  /** Linha do rodapé: o link ou o nome do corretor. */
  rodape: string;
}): Promise<Buffer> {
  const sharp = await carregarSharp();
  const { canal, copy, rodape } = params;
  const W = canal.arte.largura;
  const H = canal.arte.altura;

  // `cover` corta o excesso e nunca estica. Story perde ~16% da largura da
  // geração 2:3 — e sai sangrado, que é como story é.
  const fundo = await sharp(params.imagem)
    .resize(W, H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const camadas: Array<{ input: Buffer; top: number; left: number }> = [];

  const logo = await carregarLogo();
  if (logo) {
    // 220px de largura, canto superior esquerdo, abaixo da zona morta. Um
    // véu suave atrás para valer sobre céu claro e sobre fachada escura.
    const logoLargura = 220;
    const logoPng = await sharp(logo).resize({ width: logoLargura }).png().toBuffer();
    const meta = await sharp(logoPng).metadata();
    const altura = meta.height ?? 92;
    const topo = canal.zonaMorta.topo + MARGEM;
    const veuLogo = Buffer.from(
      `<svg width="${logoLargura + 48}" height="${altura + 40}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="100%" height="100%" rx="20" fill="${COR.fundo}" opacity="0.55"/></svg>`,
    );
    camadas.push({ input: veuLogo, top: topo - 20, left: MARGEM - 24 });
    camadas.push({ input: logoPng, top: topo, left: MARGEM });
  }

  camadas.push({
    input: Buffer.from(svgDaCopy({ canal, copy, rodape, temLogo: Boolean(logo) })),
    top: 0,
    left: 0,
  });

  return sharp(fundo).composite(camadas).png().toBuffer();
}

/**
 * Extrai as imagens embutidas de um PDF sem dependência externa.
 *
 * Irmão de `src/lib/leads/pdfTexto.ts`, e a varredura é a mesma: cada
 * `stream ... endstream` do arquivo é precedido do dicionário que diz o que
 * ele é. Lá o filtro era "tem operador de texto?"; aqui é
 * `/Subtype /Image`.
 *
 * O caso que mais importa é o `/DCTDecode`: nele os bytes do stream JÁ SÃO
 * um JPEG completo. Copiar cru preserva a resolução original do arquivo que
 * a construtora entregou — o deck exibe a foto reduzida na página, mas o
 * arquivo embutido costuma ser bem maior que isso.
 */

import { deflateSync, inflateSync, inflateRawSync } from "node:zlib";
import { TETO_IMAGENS } from "./limitesPdf";

/** Menor que isto é ícone, logo ou fio de rodapé — não é foto de imóvel. */
const LADO_MINIMO = 200;

// Os tetos moram em `limitesPdf.ts` — este módulo importa `sharp`, e quem é
// cliente não pode puxar binário nativo só para ler um número.
export { TETO_IMAGENS, TETO_PDF_BYTES } from "./limitesPdf";

export type ImagemExtraida = {
  bytes: Buffer;
  mime: "image/jpeg" | "image/png";
  largura: number;
  altura: number;
  /** Número da página em que aparece, quando determinável. */
  pagina: number | null;
  /** Proporção bate com a da página: provável página chapada (Canva). */
  parecePaginaInteira: boolean;
};

export type ResultadoImagensPdf = {
  imagens: ImagemExtraida[];
  /** Vistas mas não lidas. Some em silêncio seria pior que não achar. */
  naoSuportadas: { codec: string; quantidade: number }[];
  descartadasPorTamanho: number;
  /** Máscaras de transparência puladas — não são foto, são recorte. */
  mascarasIgnoradas: number;
};

/**
 * Objetos que outra imagem aponta como máscara de transparência.
 *
 * Máscara é o RECORTE de uma foto, não uma foto: em escala de cinza, ela é
 * uma silhueta preta e branca. Num book real de construtora duas delas
 * apareceram na grade de curadoria como quadros pretos sem sentido nenhum.
 */
function objetosQueSaoMascara(cru: string): Set<string> {
  const mascaras = new Set<string>();
  for (const achado of cru.matchAll(/\/(?:SMask|Mask)\s+(\d+)\s+\d+\s+R/g)) {
    mascaras.add(achado[1]);
  }
  return mascaras;
}

/**
 * Dicionário do objeto que contém este `stream`, do começo.
 *
 * Não dá para usar o último `<<` antes do `stream`: dicionário de imagem
 * costuma CONTER outro (`/DecodeParms << … >>`), e a busca preguiçosa pega o
 * de dentro — perdendo `/ColorSpace`, que é o que decide se a imagem é
 * legível. Num book real isso recusou 22 imagens de uma vez.
 */
function dicionarioDoObjeto(cru: string, inicioStream: number): { dicionario: string; objeto: string | null } {
  const trecho = cru.slice(Math.max(0, inicioStream - 4000), inicioStream);
  const cabecalho = [...trecho.matchAll(/(\d+)\s+\d+\s+obj/g)].pop();

  if (cabecalho?.index !== undefined) {
    return {
      dicionario: trecho.slice(cabecalho.index + cabecalho[0].length),
      objeto: cabecalho[1],
    };
  }

  // Sem cabeçalho de objeto por perto (PDF gerado de forma incomum): volta
  // ao comportamento antigo, que cobre o caso simples.
  const abre = trecho.lastIndexOf("<<");
  return { dicionario: abre === -1 ? "" : trecho.slice(abre), objeto: null };
}

function numeroDoDicionario(dicionario: string, chave: string): number | null {
  const achado = dicionario.match(new RegExp(`/${chave}\\s+(\\d+)`));
  return achado ? Number(achado[1]) : null;
}

function codecDoDicionario(dicionario: string): string {
  const achado = dicionario.match(/\/Filter\s*\/?\[?\s*\/?(\w+)/);
  return achado ? achado[1] : "sem-filtro";
}

/**
 * Proporção da primeira página do PDF. Serve de régua para desconfiar de
 * imagem que é a página inteira. Uma página só basta: deck tem formato
 * único, e ler todas custaria varrer o arquivo de novo.
 */
function proporcaoDaPagina(cru: string): number | null {
  const caixa = cru.match(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/);
  if (!caixa) return null;
  const largura = Number(caixa[3]) - Number(caixa[1]);
  const altura = Number(caixa[4]) - Number(caixa[2]);
  if (!(largura > 0) || !(altura > 0)) return null;
  return largura / altura;
}

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(dados: Buffer): number {
  let c = 0xffffffff;
  for (const byte of dados) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunkPng(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "latin1"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

/**
 * Bitmap cru (o que sai do Flate) não é um arquivo de imagem — é só a
 * sequência de pixels. Vira PNG acrescentando o byte de filtro por linha e
 * comprimindo de novo. Custa uma recompressão, mas evita uma dependência de
 * codificador de imagem só para este caso.
 */
function montarPng(pixels: Buffer, largura: number, altura: number, canais: 1 | 3): Buffer | null {
  const bytesPorLinha = largura * canais;
  if (pixels.length < bytesPorLinha * altura) return null;

  const comFiltro = Buffer.alloc((bytesPorLinha + 1) * altura);
  for (let y = 0; y < altura; y++) {
    const destino = y * (bytesPorLinha + 1);
    comFiltro[destino] = 0; // filtro "None"
    pixels.copy(comFiltro, destino + 1, y * bytesPorLinha, (y + 1) * bytesPorLinha);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = canais === 1 ? 0 : 2; // 0 = cinza, 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunkPng("IHDR", ihdr),
    chunkPng("IDAT", deflateSync(comFiltro)),
    chunkPng("IEND", Buffer.alloc(0)),
  ]);
}

/** 1 = cinza, 3 = RGB. Qualquer outra conta não é bitmap simples. */
function canaisPelaQuantidadeDeBytes(bytes: number, largura: number, altura: number): 1 | 3 | null {
  const porPixel = bytes / (largura * altura);
  if (porPixel === 1) return 1;
  if (porPixel === 3) return 3;
  return null;
}

function descomprimirFlate(bruto: Buffer): Buffer | null {
  for (const inflar of [inflateSync, inflateRawSync]) {
    try {
      return inflar(bruto);
    } catch {
      /* tenta o próximo formato */
    }
  }
  return null;
}

export function extrairImagensDePdf(pdf: Buffer | Uint8Array): ResultadoImagensPdf {
  const bytes = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  const cru = bytes.toString("latin1");

  const imagens: ImagemExtraida[] = [];
  const naoLidos = new Map<string, number>();
  let descartadasPorTamanho = 0;
  let mascarasIgnoradas = 0;

  if (!cru.startsWith("%PDF")) {
    return { imagens, naoSuportadas: [], descartadasPorTamanho, mascarasIgnoradas };
  }

  const mascaras = objetosQueSaoMascara(cru);

  const proporcaoPagina = proporcaoDaPagina(cru);

  let cursor = 0;
  while (imagens.length < TETO_IMAGENS) {
    const inicioStream = cru.indexOf("stream", cursor);
    if (inicioStream === -1) break;
    const fimStream = cru.indexOf("endstream", inicioStream);
    if (fimStream === -1) break;

    const { dicionario, objeto } = dicionarioDoObjeto(cru, inicioStream);
    cursor = fimStream + "endstream".length;

    if (!/\/Subtype\s*\/Image/.test(dicionario)) continue;

    if (objeto !== null && mascaras.has(objeto)) {
      mascarasIgnoradas++;
      continue;
    }

    const largura = numeroDoDicionario(dicionario, "Width");
    const altura = numeroDoDicionario(dicionario, "Height");
    if (!largura || !altura) continue;

    if (largura < LADO_MINIMO || altura < LADO_MINIMO) {
      descartadasPorTamanho++;
      continue;
    }

    const codec = codecDoDicionario(dicionario);

    let inicioDados = inicioStream + "stream".length;
    if (cru[inicioDados] === "\r") inicioDados++;
    if (cru[inicioDados] === "\n") inicioDados++;

    // O `endstream` vem depois de uma quebra de linha que NÃO faz parte do
    // JPEG. Sem recortar, os bytes saem com lixo no fim e o `sharp` reclama.
    let fimDados = fimStream;
    if (cru[fimDados - 1] === "\n") fimDados--;
    if (cru[fimDados - 1] === "\r") fimDados--;

    const dados = bytes.subarray(inicioDados, fimDados);

    // Deck do Canva costuma ter UMA imagem por página, do tamanho da
    // página, com logo e texto por cima. Extrair não é errado; apresentar
    // como "foto do empreendimento" sem avisar é.
    const parecePaginaInteira =
      proporcaoPagina !== null && Math.abs(largura / altura - proporcaoPagina) < 0.03;

    if (codec === "DCTDecode") {
      imagens.push({
        bytes: dados,
        mime: "image/jpeg",
        largura,
        altura,
        pagina: null,
        parecePaginaInteira,
      });
      continue;
    }

    if (codec === "FlateDecode") {
      // Só bitmap de 8 bits em cinza ou RGB. Paleta indexada e máscara
      // precisariam do dicionário de cores; são raras em deck e viram
      // "não suportado" em vez de saírem com a cor errada.
      const bits = numeroDoDicionario(dicionario, "BitsPerComponent");
      const pixels = bits === 8 ? descomprimirFlate(dados) : null;

      // O espaço de cor pode vir por REFERÊNCIA (`/ColorSpace 663 0 R`), e
      // resolvê-la exigiria montar a tabela de objetos do arquivo inteiro.
      // Quando isso acontece, a própria quantidade de bytes responde: um
      // bitmap tem exatamente largura x altura x canais.
      const canais = /\/DeviceRGB/.test(dicionario)
        ? 3
        : /\/DeviceGray/.test(dicionario)
          ? 1
          : pixels
            ? canaisPelaQuantidadeDeBytes(pixels.length, largura, altura)
            : null;

      const png = pixels && canais ? montarPng(pixels, largura, altura, canais) : null;

      if (png) {
        imagens.push({
          bytes: png,
          mime: "image/png",
          largura,
          altura,
          pagina: null,
          parecePaginaInteira,
        });
      } else {
        naoLidos.set("FlateDecode", (naoLidos.get("FlateDecode") ?? 0) + 1);
      }
      continue;
    }

    naoLidos.set(codec, (naoLidos.get(codec) ?? 0) + 1);
  }

  return {
    imagens,
    naoSuportadas: [...naoLidos].map(([codec, quantidade]) => ({ codec, quantidade })),
    descartadasPorTamanho,
    mascarasIgnoradas,
  };
}

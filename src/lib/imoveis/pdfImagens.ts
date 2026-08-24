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

/** Menor que isto é ícone, logo ou fio de rodapé — não é foto de imóvel. */
const LADO_MINIMO = 200;

/** Deck de 80 páginas não pode virar 80 mídias. */
export const TETO_IMAGENS = 60;

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
};

function numeroDoDicionario(dicionario: string, chave: string): number | null {
  const achado = dicionario.match(new RegExp(`/${chave}\\s+(\\d+)`));
  return achado ? Number(achado[1]) : null;
}

function codecDoDicionario(dicionario: string): string {
  const achado = dicionario.match(/\/Filter\s*\/?\[?\s*\/?(\w+)/);
  return achado ? achado[1] : "sem-filtro";
}

export function extrairImagensDePdf(pdf: Buffer | Uint8Array): ResultadoImagensPdf {
  const bytes = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  const cru = bytes.toString("latin1");

  const imagens: ImagemExtraida[] = [];
  const naoLidos = new Map<string, number>();
  let descartadasPorTamanho = 0;

  if (!cru.startsWith("%PDF")) {
    return { imagens, naoSuportadas: [], descartadasPorTamanho };
  }

  let cursor = 0;
  while (imagens.length < TETO_IMAGENS) {
    const inicioStream = cru.indexOf("stream", cursor);
    if (inicioStream === -1) break;
    const fimStream = cru.indexOf("endstream", inicioStream);
    if (fimStream === -1) break;

    const abreDicionario = cru.lastIndexOf("<<", inicioStream);
    const dicionario = abreDicionario === -1 ? "" : cru.slice(abreDicionario, inicioStream);
    cursor = fimStream + "endstream".length;

    if (!/\/Subtype\s*\/Image/.test(dicionario)) continue;

    const largura = numeroDoDicionario(dicionario, "Width");
    const altura = numeroDoDicionario(dicionario, "Height");
    if (!largura || !altura) continue;

    if (largura < LADO_MINIMO || altura < LADO_MINIMO) {
      descartadasPorTamanho++;
      continue;
    }

    const codec = codecDoDicionario(dicionario);
    if (codec !== "DCTDecode") {
      naoLidos.set(codec, (naoLidos.get(codec) ?? 0) + 1);
      continue;
    }

    let inicioDados = inicioStream + "stream".length;
    if (cru[inicioDados] === "\r") inicioDados++;
    if (cru[inicioDados] === "\n") inicioDados++;

    // O `endstream` vem depois de uma quebra de linha que NÃO faz parte do
    // JPEG. Sem recortar, os bytes saem com lixo no fim e o `sharp` reclama.
    let fimDados = fimStream;
    if (cru[fimDados - 1] === "\n") fimDados--;
    if (cru[fimDados - 1] === "\r") fimDados--;

    imagens.push({
      bytes: bytes.subarray(inicioDados, fimDados),
      mime: "image/jpeg",
      largura,
      altura,
      pagina: null,
      parecePaginaInteira: false,
    });
  }

  return {
    imagens,
    naoSuportadas: [...naoLidos].map(([codec, quantidade]) => ({ codec, quantidade })),
    descartadasPorTamanho,
  };
}

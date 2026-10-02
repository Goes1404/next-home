import { inflateSync, inflateRawSync } from "node:zlib";

/**
 * Extrai o texto de um PDF sem dependência externa e sem IA.
 *
 * Existe porque a leitura de PDF não pode depender de uma chave de API para
 * funcionar: relatório de portal e lista exportada são PDF de TEXTO, gerados
 * a partir de HTML ou de planilha, e nesses o conteúdo está literalmente
 * dentro do arquivo — basta descomprimir e ler. Mandar para um modelo o que
 * já está escrito ali é pagar para adivinhar o que dá para conferir.
 *
 * O que este extrator NÃO faz, de propósito:
 *
 *   - PDF escaneado (página é imagem, não há texto nenhum a extrair);
 *   - fonte com codificação customizada SEM `/ToUnicode` (com ele, o mapa é
 *     lido: `lerCMap`);
 *   - preservar colunas de tabela com fidelidade — a ordem é a do fluxo de
 *     desenho, que quase sempre é a de leitura, mas não é garantida.
 *
 * Nesses casos o texto sai vazio ou sem telefone reconhecível, e quem chama
 * (`extrairDePdf`) manda o arquivo para a IA. Um caminho cobre o outro.
 */

/** Um PDF de lista de contatos não passa disso; acima é catálogo com imagem. */
const LIMITE_TEXTO = 400_000;

/** Objeto que nunca é página: imagem, fonte embutida, perfil de cor, CMap. */
const NAO_E_CONTEUDO = /\/Subtype\s*\/Image|\/FontFile|\/Length1\b|\/Length2\b|\/N\s+\d|\/Type\s*\/(XRef|ObjStm|Metadata)/;

/**
 * Só o que tem bloco de texto (`BT … ET` com `Tj`/`TJ`) é fluxo de conteúdo.
 *
 * Olhar só os primeiros 4 KB, como era, descartava a tabela de preço gerada
 * de HTML (02/10/2026): ela começa com 170 mil bytes de retângulos da grade,
 * e o primeiro `BT` vinha depois disso. O fluxo inteiro é procurado, e imagem,
 * fonte e perfil de cor saem pelo DICIONÁRIO — binário pode ter "BT" por acaso.
 */
function ehFluxoDeTexto(bytes: Buffer, dicionario: string): boolean {
  if (NAO_E_CONTEUDO.test(dicionario)) return false;
  const texto = bytes.toString("latin1");
  if (texto.includes("begincmap")) return false;
  return /\bBT\b/.test(texto) && /T[jJ]\b/.test(texto);
}

function descomprimir(bruto: Buffer, dicionario: string): Buffer | null {
  if (!/\/Filter\s*(\/FlateDecode|\[\s*\/FlateDecode)/.test(dicionario)) {
    // Sem filtro: o fluxo já está em texto puro (comum em PDF gerado por
    // ferramenta simples, e é o caso mais fácil).
    return /\/Filter/.test(dicionario) ? null : bruto;
  }
  for (const inflar of [inflateSync, inflateRawSync]) {
    try {
      return inflar(bruto);
    } catch {
      // tenta o próximo formato
    }
  }
  return null;
}

/**
 * Lê uma string de conteúdo: `(literal)` com escapes ou `<hexadecimal>`.
 * Devolve os BYTES e onde a string terminou: quem decide como viram texto é
 * a fonte em uso (`decodificar`).
 */
function lerString(fonte: string, inicio: number): { bytes: number[]; fim: number } | null {
  if (fonte[inicio] === "(") {
    let profundidade = 1;
    let i = inicio + 1;
    let saida = "";

    while (i < fonte.length && profundidade > 0) {
      const c = fonte[i];

      if (c === "\\") {
        const proximo = fonte[i + 1];
        const escapes: Record<string, string> = {
          n: "\n",
          r: "\r",
          t: "\t",
          b: "\b",
          f: "\f",
          "(": "(",
          ")": ")",
          "\\": "\\",
        };
        if (proximo in escapes) {
          saida += escapes[proximo];
          i += 2;
          continue;
        }
        // \ddd octal
        const octal = fonte.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
        if (octal) {
          saida += String.fromCharCode(parseInt(octal[0], 8));
          i += 1 + octal[0].length;
          continue;
        }
        // Barra antes de quebra de linha = continuação, não imprime nada.
        i += 2;
        continue;
      }

      if (c === "(") profundidade++;
      if (c === ")") {
        profundidade--;
        if (profundidade === 0) break;
      }
      saida += c;
      i++;
    }

    return { bytes: [...saida].map((ch) => ch.charCodeAt(0) & 0xff), fim: i + 1 };
  }

  if (fonte[inicio] === "<" && fonte[inicio + 1] !== "<") {
    const fim = fonte.indexOf(">", inicio);
    if (fim === -1) return null;
    const hex = fonte.slice(inicio + 1, fim).replace(/\s/g, "");
    const pares = hex.match(/.{1,2}/g) ?? [];
    const bytes = pares.map((p) => parseInt(p.padEnd(2, "0"), 16));

    return { bytes, fim: fim + 1 };
  }

  return null;
}

/**
 * Bytes de uma string de conteúdo viram texto. Com mapa da fonte
 * (`/ToUnicode`), o mapa manda; sem ele, UTF-16BE ou latin1.
 */
function decodificar(bytes: number[], mapa: MapaDeFonte | null): string {
  if (mapa) {
    let saida = "";
    for (let i = 0; i + mapa.bytesPorCodigo <= bytes.length; i += mapa.bytesPorCodigo) {
      let codigo = 0;
      for (let k = 0; k < mapa.bytesPorCodigo; k++) codigo = (codigo << 8) | bytes[i + k];
      saida += mapa.unicode.get(codigo) ?? "";
    }
    return saida;
  }

  // Um em cada dois bytes zerado é a assinatura de UTF-16BE, que é como o
  // texto acentuado costuma sair de gerador moderno.
  const ehUtf16 =
    bytes.length >= 4 && bytes.length % 2 === 0 && bytes.filter((b, i) => i % 2 === 0 && b === 0).length > bytes.length / 4;
  return ehUtf16 ? decodificarUtf16be(bytes) : Buffer.from(bytes).toString("latin1");
}

function decodificarUtf16be(bytes: number[]): string {
  let saida = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    saida += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return saida;
}

/**
 * Percorre um fluxo de conteúdo e devolve só o texto desenhado.
 *
 * Operadores de posicionamento (`Td`, `TD`, `T*`, `Tm`) viram quebra de
 * linha: é o que reconstrói a tabela em linhas, e a linha é a unidade que o
 * parser de leads entende.
 */
function textoDoFluxo(fluxo: string, fontes: Map<string, MapaDeFonte> = new Map()): string {
  let saida = "";
  let i = 0;
  let mapa: MapaDeFonte | null = null;

  while (i < fluxo.length) {
    const c = fluxo[i];

    // `/Nome 12 Tf` troca a fonte, e com ela o jeito de ler os bytes.
    if (c === "/") {
      const tf = fluxo.slice(i, i + 160).match(/^\/([^\s/<>[\]()]+)\s+-?[\d.]+\s+Tf/);
      if (tf) {
        mapa = fontes.get(tf[1]) ?? null;
        i += tf[0].length;
        continue;
      }
    }

    if (c === "(" || (c === "<" && fluxo[i + 1] !== "<")) {
      const lido = lerString(fluxo, i);
      if (!lido) {
        i++;
        continue;
      }
      saida += decodificar(lido.bytes, mapa);
      i = lido.fim;
      continue;
    }

    if (c === "[") {
      // Array do operador TJ: strings intercaladas com ajustes de espaço.
      // Um recuo grande (bem negativo) é o espaço entre palavras.
      let j = i + 1;
      while (j < fluxo.length && fluxo[j] !== "]") {
        if (fluxo[j] === "(" || (fluxo[j] === "<" && fluxo[j + 1] !== "<")) {
          const lido = lerString(fluxo, j);
          if (!lido) break;
          saida += decodificar(lido.bytes, mapa);
          j = lido.fim;
          continue;
        }
        const ajuste = fluxo.slice(j).match(/^-?\d+(\.\d+)?/);
        if (ajuste) {
          if (Number(ajuste[0]) < -120) saida += " ";
          j += ajuste[0].length;
          continue;
        }
        j++;
      }
      i = j + 1;
      continue;
    }

    // Operadores que movem o cursor de texto para outra linha.
    const quebra = fluxo.slice(i, i + 3).match(/^(T\*|Td|TD|Tm|ET)/);
    if (quebra && !/[A-Za-z0-9]/.test(fluxo[i - 1] ?? " ")) {
      if (!saida.endsWith("\n")) saida += "\n";
      i += quebra[0].length;
      continue;
    }

    i++;
  }

  return saida;
}

/** Como os bytes de uma fonte viram texto: o `/ToUnicode` dela. */
type MapaDeFonte = { bytesPorCodigo: number; unicode: Map<number, string> };

/**
 * Lê um CMap `/ToUnicode` (`bfchar` e `bfrange`). O destino é UTF-16BE.
 *
 * É o que destrava a tabela de preço gerada por relatório (02/10/2026): a
 * fonte Type0 com `/Identity-H` grava o NÚMERO DO GLIFO, não a letra, e sem
 * este mapa "Todas" saía como "7RGDV". A IA recebia lixo e não achava preço.
 */
export function lerCMap(cmap: string): MapaDeFonte {
  const unicode = new Map<number, string>();
  const utf16 = (hex: string) => {
    let t = "";
    for (let i = 0; i + 4 <= hex.length; i += 4) t += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    if (hex.length % 4 === 2) t += String.fromCharCode(parseInt(hex.slice(-2), 16));
    return t;
  };

  const espaco = cmap.match(/begincodespacerange\s*<([0-9A-Fa-f]+)>/);
  const bytesPorCodigo = espaco ? Math.max(1, Math.round(espaco[1].length / 2)) : 2;

  for (const bloco of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const par of bloco[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) {
      unicode.set(parseInt(par[1], 16), utf16(par[2]));
    }
  }
  for (const bloco of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const faixa of bloco[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(faixa[1], 16);
      const hi = parseInt(faixa[2], 16);
      if (hi < lo || hi - lo > 0xffff) continue;
      if (faixa[3].startsWith("[")) {
        const destinos = [...faixa[3].matchAll(/<([0-9A-Fa-f]*)>/g)].map((m) => utf16(m[1]));
        destinos.forEach((d, k) => unicode.set(lo + k, d));
      } else {
        const base = faixa[3].slice(1, -1);
        const inicio = parseInt(base.slice(-4) || "0", 16);
        const prefixo = utf16(base.slice(0, -4));
        for (let c = lo; c <= hi; c++) unicode.set(c, prefixo + String.fromCharCode(inicio + (c - lo)));
      }
    }
  }
  return { bytesPorCodigo, unicode };
}

/**
 * Nome de recurso da fonte (`/F1`, `/AYBQCF+Tahoma`) → mapa de leitura.
 * Os nomes vêm dos dicionários `/Font << … >>` do arquivo inteiro: num PDF de
 * relatório eles são os mesmos em toda página, e guardar recurso por página
 * só para isto seria montar a árvore inteira do documento.
 */
function mapasDeFonte(cru: string, bytes: Buffer): Map<string, MapaDeFonte> {
  const objetos = new Map<string, { inicio: number; fim: number }>();
  for (const m of cru.matchAll(/(\d+)\s+0\s+obj\b/g)) {
    const inicio = m.index ?? 0;
    const fim = cru.indexOf("endobj", inicio);
    if (fim !== -1) objetos.set(m[1], { inicio, fim });
  }
  const textoDoObjeto = (n: string) => {
    const o = objetos.get(n);
    return o ? cru.slice(o.inicio, o.fim) : "";
  };
  const fluxoDoObjeto = (n: string): string | null => {
    const o = objetos.get(n);
    if (!o) return null;
    const corpo = cru.slice(o.inicio, o.fim);
    const s = corpo.indexOf("stream");
    if (s === -1) return null;
    let dados = o.inicio + s + "stream".length;
    if (cru[dados] === "\r") dados++;
    if (cru[dados] === "\n") dados++;
    const fimStream = cru.indexOf("endstream", dados);
    if (fimStream === -1 || fimStream > o.fim) return null;
    const conteudo = descomprimir(bytes.subarray(dados, fimStream), corpo.slice(0, s));
    return conteudo ? conteudo.toString("latin1") : null;
  };

  const mapas = new Map<string, MapaDeFonte>();
  for (const dic of cru.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) {
    for (const ref of dic[1].matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+0\s+R/g)) {
      if (mapas.has(ref[1])) continue;
      const toUnicode = textoDoObjeto(ref[2]).match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (!toUnicode) continue;
      const cmap = fluxoDoObjeto(toUnicode[1]);
      if (!cmap) continue;
      const mapa = lerCMap(cmap);
      if (mapa.unicode.size > 0) mapas.set(ref[1], mapa);
    }
  }
  return mapas;
}

/**
 * Texto de um PDF, página a página, na ordem em que aparece no arquivo.
 * Devolve string vazia quando o PDF não tem texto extraível.
 */
export function extrairTextoDePdf(pdf: Buffer | Uint8Array): string {
  const bytes = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  const cru = bytes.toString("latin1");

  if (!cru.startsWith("%PDF")) return "";

  const fontes = mapasDeFonte(cru, bytes);
  const partes: string[] = [];
  let cursor = 0;

  while (partes.join("").length < LIMITE_TEXTO) {
    const inicioStream = cru.indexOf("stream", cursor);
    if (inicioStream === -1) break;

    const fimStream = cru.indexOf("endstream", inicioStream);
    if (fimStream === -1) break;

    // O dicionário do objeto vem logo antes do `stream` e diz qual filtro usar.
    // Ele começa no cabeçalho do objeto (`N 0 obj`): o último `<<` antes do
    // stream pode ser um dicionário de DENTRO (os recursos de um Form).
    const cabecalho = cru.lastIndexOf(" obj", inicioStream);
    const inicioDicionario = cabecalho === -1 ? cru.lastIndexOf("<<", inicioStream) : cabecalho;
    const dicionario = inicioDicionario === -1 ? "" : cru.slice(inicioDicionario, inicioStream);

    // Depois de `stream` vem CRLF ou LF antes dos dados.
    let dados = inicioStream + "stream".length;
    if (cru[dados] === "\r") dados++;
    if (cru[dados] === "\n") dados++;

    const bruto = bytes.subarray(dados, fimStream);
    const conteudo = descomprimir(bruto, dicionario);

    if (conteudo && ehFluxoDeTexto(conteudo, dicionario)) {
      partes.push(textoDoFluxo(conteudo.toString("latin1"), fontes));
    }

    cursor = fimStream + "endstream".length;
  }

  return partes
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, LIMITE_TEXTO);
}

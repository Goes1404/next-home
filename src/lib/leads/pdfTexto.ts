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

/** Matriz afim do PDF: [a b c d e f], com vetor-linha (x' = x·a + y·c + e). */
type Matriz = [number, number, number, number, number, number];

const IDENTIDADE: Matriz = [1, 0, 0, 1, 0, 0];

function multiplicar(m1: Matriz, m2: Matriz): Matriz {
  return [
    m1[0] * m2[0] + m1[1] * m2[2],
    m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2],
    m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4],
    m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

const deslocar = (tx: number, ty: number, m: Matriz): Matriz => multiplicar([1, 0, 0, 1, tx, ty], m);

/** Largura média de um glifo, em em, quando a fonte não diz as larguras. */
const LARGURA_ESTIMADA = 0.55;

type Token =
  | { tipo: "num"; valor: number }
  | { tipo: "nome"; valor: string }
  | { tipo: "str"; bytes: number[] }
  | { tipo: "abre" }
  | { tipo: "fecha" }
  | { tipo: "op"; valor: string };

/**
 * Percorre um fluxo de conteúdo e devolve só o texto desenhado.
 *
 * A quebra de linha sai da POSIÇÃO na página, não do operador. Até
 * 13/10/2026 todo `Td`/`Tm` virava quebra, e PDF que posiciona letra por
 * letra (Canva, exportação de design, o tabelão da RSF) saía com UMA LETRA
 * POR LINHA — "381.405,62" virava dez linhas e a leitura de preço não achava
 * valor nenhum escrito. Hoje o fluxo é interpretado: matriz de texto, matriz
 * de transformação (`cm`, `q`/`Q`) e a largura de cada glifo (da fonte quando
 * ela diz, estimada quando não). Mesma linha de base = mesma linha de texto;
 * salto para a frente maior que um quarto de letra = espaço.
 */
function textoDoFluxo(fluxo: string, fontes: Map<string, Fonte> = new Map()): string {
  let saida = "";

  let ctm: Matriz = IDENTIDADE;
  const pilha: Matriz[] = [];
  let tm: Matriz = IDENTIDADE;
  let tlm: Matriz = IDENTIDADE;
  let fonte: Fonte | null = null;
  let tamanho = 12;
  let entrelinha = 0;
  let espacoLetra = 0;
  let espacoPalavra = 0;
  let escalaH = 1;

  /** Houve `Td`/`Tm`/`T*` desde o último pedaço (dentro de um TJ, não há). */
  let reposicionado = false;
  let ultimo: { y: number; fimX: number; altura: number; letras: number } | null = null;

  /** Desenha uma string na posição atual e avança a matriz de texto. */
  function mostrar(bytes: number[]) {
    const m = multiplicar(tm, ctm);
    const sx = Math.hypot(m[0], m[1]) || 1;
    const sy = Math.hypot(m[2], m[3]) || 1;
    const altura = Math.abs(tamanho) * sy;
    const em = Math.abs(tamanho) * sx * escalaH || 1;
    const x = m[4];
    const y = m[5];

    const texto = decodificar(bytes, fonte?.mapa ?? null);
    if (!texto) return;

    if (ultimo) {
      const tolerancia = Math.max(altura, ultimo.altura) * 0.5;
      if (Math.abs(y - ultimo.y) > tolerancia) {
        if (!saida.endsWith("\n")) saida += "\n";
      } else {
        const folga = (x - ultimo.fimX) / em;
        // Sem a largura da fonte o fim do pedaço anterior é estimado, e a
        // estimativa erra para os dois lados. Letra solta só ganha espaço
        // com folga clara; dois pedaços de várias letras reposicionados na
        // mesma linha são palavras (ou células) diferentes, salvo sobreposição.
        const espaco = fonte?.largura
          ? folga > 0.15
          : folga > 0.25 || (reposicionado && texto.length > 1 && ultimo.letras > 1 && folga > -0.15);
        if (espaco && !/\s$/.test(saida) && !/^\s/.test(texto)) saida += " ";
      }
    }
    saida += texto;

    // Avanço: soma das larguras dos glifos, com o espaço entre letras e o
    // espaço entre palavras do estado gráfico.
    const porCodigo = fonte?.bytesPorCodigo ?? 1;
    let avanco = 0;
    for (let i = 0; i + porCodigo <= bytes.length; i += porCodigo) {
      let codigo = 0;
      for (let k = 0; k < porCodigo; k++) codigo = (codigo << 8) | bytes[i + k];
      const w = fonte?.largura?.(codigo);
      avanco += ((w ?? LARGURA_ESTIMADA * 1000) / 1000) * tamanho + espacoLetra;
      if (porCodigo === 1 && codigo === 32) avanco += espacoPalavra;
    }
    if (porCodigo > 1 && bytes.length > 0 && bytes.length < porCodigo) {
      avanco += LARGURA_ESTIMADA * tamanho;
    }
    tm = deslocar(avanco * escalaH, 0, tm);

    const fim = multiplicar(tm, ctm);
    ultimo = { y, fimX: fim[4], altura, letras: texto.length };
    reposicionado = false;
  }

  function proximaLinha() {
    reposicionado = true;
    tlm = deslocar(0, -entrelinha, tlm);
    tm = tlm;
  }

  let operandos: Token[] = [];
  let arranjo: Token[] | null = null;
  const num = (k: number) => {
    const t = operandos[operandos.length - k];
    return t && t.tipo === "num" ? t.valor : 0;
  };

  let aberto = false;

  for (const token of tokens(fluxo)) {
    if (token.tipo === "abre") {
      arranjo = [];
      aberto = true;
      continue;
    }
    if (token.tipo === "fecha") {
      aberto = false;
      continue;
    }
    if (aberto && arranjo && token.tipo !== "op") {
      arranjo.push(token);
      continue;
    }
    if (token.tipo !== "op") {
      operandos.push(token);
      continue;
    }

    switch (token.valor) {
      case "q":
        pilha.push(ctm);
        break;
      case "Q":
        ctm = pilha.pop() ?? IDENTIDADE;
        break;
      case "cm":
        ctm = multiplicar([num(6), num(5), num(4), num(3), num(2), num(1)], ctm);
        break;
      case "BT":
        tm = IDENTIDADE;
        tlm = IDENTIDADE;
        break;
      case "Tf": {
        const nome = operandos[operandos.length - 2];
        fonte = nome && nome.tipo === "nome" ? (fontes.get(nome.valor) ?? null) : null;
        tamanho = num(1) || tamanho;
        break;
      }
      case "TL":
        entrelinha = num(1);
        break;
      case "Tc":
        espacoLetra = num(1);
        break;
      case "Tw":
        espacoPalavra = num(1);
        break;
      case "Tz":
        escalaH = num(1) / 100 || 1;
        break;
      case "Td":
        reposicionado = true;
        tlm = deslocar(num(2), num(1), tlm);
        tm = tlm;
        break;
      case "TD":
        reposicionado = true;
        entrelinha = -num(1);
        tlm = deslocar(num(2), num(1), tlm);
        tm = tlm;
        break;
      case "Tm":
        reposicionado = true;
        tlm = [num(6), num(5), num(4), num(3), num(2), num(1)];
        tm = tlm;
        break;
      case "T*":
        reposicionado = true;
        proximaLinha();
        break;
      case "Tj":
      case "'":
      case '"': {
        if (token.valor === '"') {
          espacoPalavra = num(3);
          espacoLetra = num(2);
        }
        if (token.valor !== "Tj") proximaLinha();
        const s = operandos[operandos.length - 1];
        if (s && s.tipo === "str") mostrar(s.bytes);
        break;
      }
      case "TJ":
        for (const item of arranjo ?? []) {
          if (item.tipo === "str") mostrar(item.bytes);
          else if (item.tipo === "num") tm = deslocar((-item.valor / 1000) * tamanho * escalaH, 0, tm);
        }
        break;
    }
    operandos = [];
    arranjo = null;
    aberto = false;
  }

  return saida;
}

/** Quebra o fluxo de conteúdo em números, nomes, strings, `[`, `]` e operadores. */
function* tokens(fluxo: string): Generator<Token> {
  let i = 0;
  const n = fluxo.length;
  const delimitador = /[\s()<>[\]{}/%]/;

  while (i < n) {
    const c = fluxo[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "%") {
      while (i < n && fluxo[i] !== "\n" && fluxo[i] !== "\r") i++;
      continue;
    }
    if (c === "(" || (c === "<" && fluxo[i + 1] !== "<")) {
      const lido = lerString(fluxo, i);
      if (!lido) {
        i++;
        continue;
      }
      yield { tipo: "str", bytes: lido.bytes };
      i = lido.fim;
      continue;
    }
    if (c === "<" || c === ">") {
      // `<<` e `>>` de dicionário (propriedades de conteúdo marcado): o
      // dicionário não interessa, só o operador que vem depois.
      i += fluxo[i + 1] === c ? 2 : 1;
      continue;
    }
    if (c === "[") {
      yield { tipo: "abre" };
      i++;
      continue;
    }
    if (c === "]") {
      yield { tipo: "fecha" };
      i++;
      continue;
    }
    if (c === "{" || c === "}") {
      i++;
      continue;
    }
    if (c === "/") {
      let j = i + 1;
      while (j < n && !delimitador.test(fluxo[j])) j++;
      yield { tipo: "nome", valor: fluxo.slice(i + 1, j) };
      i = j;
      continue;
    }

    let j = i;
    while (j < n && !delimitador.test(fluxo[j])) j++;
    if (j === i) {
      i++;
      continue;
    }
    const palavra = fluxo.slice(i, j);
    i = j;

    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(palavra)) {
      yield { tipo: "num", valor: Number(palavra) };
      continue;
    }

    // Imagem embutida: os bytes entre `ID` e `EI` são binários e poderiam
    // parecer qualquer operador.
    if (palavra === "ID") {
      const fimImagem = fluxo.slice(i).search(/\sEI(\s|$)/);
      i = fimImagem === -1 ? n : i + fimImagem + 3;
      continue;
    }

    yield { tipo: "op", valor: palavra };
  }
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
 * O que o extrator sabe de uma fonte: como os bytes viram letra
 * (`/ToUnicode`) e quanto cada glifo anda (`/Widths` ou `/W`, em milésimos
 * de em). Sem a largura, o avanço é estimado e a detecção de espaço fica
 * mais grosseira — mas a de linha, que é a que importa, não depende dela.
 */
type Fonte = {
  mapa: MapaDeFonte | null;
  bytesPorCodigo: number;
  largura?: (codigo: number) => number | undefined;
};

/**
 * Lê objetos pelo número, inclusive os guardados dentro de `/ObjStm`
 * (PDF 1.5+, o comum em exportação de design): ali o dicionário da fonte
 * fica comprimido e uma busca por `N 0 obj` no arquivo não o acha.
 */
function indiceDeObjetos(cru: string, bytes: Buffer) {
  const objetos = new Map<string, { inicio: number; fim: number }>();
  for (const m of cru.matchAll(/(\d+)\s+0\s+obj\b/g)) {
    const inicio = m.index ?? 0;
    const fim = cru.indexOf("endobj", inicio);
    if (fim !== -1) objetos.set(m[1], { inicio, fim });
  }

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

  const comprimidos = new Map<string, string>();
  for (const [n, o] of objetos) {
    const cabeca = cru.slice(o.inicio, Math.min(o.fim, o.inicio + 400));
    if (!/\/Type\s*\/ObjStm/.test(cabeca)) continue;
    const quantos = Number(cabeca.match(/\/N\s+(\d+)/)?.[1] ?? 0);
    const primeiro = Number(cabeca.match(/\/First\s+(\d+)/)?.[1] ?? 0);
    const conteudo = fluxoDoObjeto(n);
    if (!conteudo || !quantos) continue;
    const pares = conteudo.slice(0, primeiro).trim().split(/\s+/).map(Number);
    for (let k = 0; k < quantos; k++) {
      const num = pares[2 * k];
      const deslocamento = pares[2 * k + 1];
      const proximo = k + 1 < quantos ? pares[2 * (k + 1) + 1] : conteudo.length - primeiro;
      if (!Number.isFinite(num) || !Number.isFinite(deslocamento)) continue;
      comprimidos.set(String(num), conteudo.slice(primeiro + deslocamento, primeiro + proximo));
    }
  }

  const textoDoObjeto = (n: string) => {
    const o = objetos.get(n);
    return o ? cru.slice(o.inicio, o.fim) : (comprimidos.get(n) ?? "");
  };

  return { textoDoObjeto, fluxoDoObjeto, comprimidos: [...comprimidos.values()] };
}

/** `/Chave 12 0 R` resolvido para o texto do objeto; valor direto, como veio. */
function valorDe(dicionario: string, chave: string, textoDoObjeto: (n: string) => string): string | null {
  const ref = dicionario.match(new RegExp(`/${chave}\\s+(\\d+)\\s+0\\s+R`));
  if (ref) return textoDoObjeto(ref[1]).replace(/^\s*\d+\s+0\s+obj\b/, "");
  const direto = dicionario.match(new RegExp(`/${chave}\\s*(\\[[^\\]]*\\]|-?[\\d.]+)`));
  return direto ? direto[1] : null;
}

/** Larguras de fonte simples: `/FirstChar` + `/Widths`. */
function largurasSimples(dic: string, textoDoObjeto: (n: string) => string) {
  const primeiro = Number(dic.match(/\/FirstChar\s+(\d+)/)?.[1] ?? NaN);
  const widths = valorDe(dic, "Widths", textoDoObjeto);
  if (!Number.isFinite(primeiro) || !widths) return undefined;
  const lista = (widths.match(/-?[\d.]+/g) ?? []).map(Number);
  if (lista.length === 0) return undefined;
  return (codigo: number) => lista[codigo - primeiro];
}

/** Larguras de fonte CID (Type0): `/W` e `/DW` da fonte descendente. */
function largurasCid(descendente: string, textoDoObjeto: (n: string) => string) {
  const padrao = Number(descendente.match(/\/DW\s+([\d.]+)/)?.[1] ?? 1000);
  const w = descendente.match(/\/W\s+(\d+)\s+0\s+R/)
    ? textoDoObjeto(descendente.match(/\/W\s+(\d+)\s+0\s+R/)![1])
    : (descendente.match(/\/W\s*(\[[\s\S]*?\]\s*\])/)?.[1] ?? "");
  const mapa = new Map<number, number>();
  // `/W [ c [w1 w2 …]  c1 c2 w ]`
  const corpo = w.replace(/^[^[]*\[/, "").replace(/\]\s*$/, "");
  const re = /(\d+)\s*\[([^\]]*)\]|(\d+)\s+(\d+)\s+([\d.]+)/g;
  for (const m of corpo.matchAll(re)) {
    if (m[1] !== undefined) {
      const inicio = Number(m[1]);
      (m[2].match(/-?[\d.]+/g) ?? []).forEach((v, k) => mapa.set(inicio + k, Number(v)));
    } else {
      const de = Number(m[3]);
      const ate = Number(m[4]);
      if (ate - de > 0xffff) continue;
      for (let c = de; c <= ate; c++) mapa.set(c, Number(m[5]));
    }
  }
  return (codigo: number) => mapa.get(codigo) ?? padrao;
}

/**
 * Nome de recurso da fonte (`/F1`, `/AYBQCF+Tahoma`) → como ler e medir.
 * Os nomes vêm dos dicionários `/Font << … >>` do arquivo inteiro: num PDF de
 * relatório eles são os mesmos em toda página, e guardar recurso por página
 * só para isto seria montar a árvore inteira do documento.
 */
function fontesDoArquivo(cru: string, bytes: Buffer): Map<string, Fonte> {
  const { textoDoObjeto, fluxoDoObjeto, comprimidos } = indiceDeObjetos(cru, bytes);

  // Dicionários de recurso de fonte: no arquivo e dentro dos objetos
  // comprimidos (a página exportada por ferramenta de design mora lá).
  const recursos: string[] = [];
  for (const texto of [cru, ...comprimidos]) {
    for (const dic of texto.matchAll(/\/Font\s*<<([\s\S]*?)>>/g)) recursos.push(dic[1]);
    for (const ref of texto.matchAll(/\/Font\s+(\d+)\s+0\s+R/g)) {
      const alvo = textoDoObjeto(ref[1]).match(/<<([\s\S]*)>>/);
      if (alvo) recursos.push(alvo[1]);
    }
  }

  const fontes = new Map<string, Fonte>();
  const lidos = new Set<string>();
  const tentar = (corpoRecursos: string) => {
    for (const ref of corpoRecursos.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+0\s+R/g)) {
      if (lidos.has(ref[1])) continue;
      lidos.add(ref[1]);
      const dic = textoDoObjeto(ref[2]);
      if (!dic) continue;

      let mapa: MapaDeFonte | null = null;
      const toUnicode = dic.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
      if (toUnicode) {
        const cmap = fluxoDoObjeto(toUnicode[1]);
        if (cmap) {
          const lido = lerCMap(cmap);
          if (lido.unicode.size > 0) mapa = lido;
        }
      }

      const type0 = /\/Subtype\s*\/Type0/.test(dic);
      let largura: Fonte["largura"];
      if (type0) {
        const desc = dic.match(/\/DescendantFonts\s*(?:\[\s*(\d+)\s+0\s+R|(\d+)\s+0\s+R)/);
        let descendente = "";
        if (desc?.[1]) descendente = textoDoObjeto(desc[1]);
        else if (desc?.[2]) {
          const arr = textoDoObjeto(desc[2]).match(/(\d+)\s+0\s+R/);
          descendente = arr ? textoDoObjeto(arr[1]) : "";
        }
        if (descendente) largura = largurasCid(descendente, textoDoObjeto);
      } else {
        largura = largurasSimples(dic, textoDoObjeto);
      }

      const bytesPorCodigo = mapa?.bytesPorCodigo ?? (type0 ? 2 : 1);
      if (mapa || largura) fontes.set(ref[1], { mapa, bytesPorCodigo, largura });
    }
  };
  for (const r of recursos) tentar(r);
  return fontes;
}

/**
 * Texto de um PDF, página a página, na ordem em que aparece no arquivo.
 * Devolve string vazia quando o PDF não tem texto extraível.
 */
export function extrairTextoDePdf(pdf: Buffer | Uint8Array): string {
  const bytes = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  const cru = bytes.toString("latin1");

  if (!cru.startsWith("%PDF")) return "";

  const fontes = fontesDoArquivo(cru, bytes);
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

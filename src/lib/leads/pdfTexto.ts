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
 *   - fonte com codificação customizada sem mapa direto, que sai embaralhada;
 *   - preservar colunas de tabela com fidelidade — a ordem é a do fluxo de
 *     desenho, que quase sempre é a de leitura, mas não é garantida.
 *
 * Nesses casos o texto sai vazio ou sem telefone reconhecível, e quem chama
 * (`extrairDePdf`) manda o arquivo para a IA. Um caminho cobre o outro.
 */

/** Um PDF de lista de contatos não passa disso; acima é catálogo com imagem. */
const LIMITE_TEXTO = 400_000;

/** Só o que tem operador de texto é fluxo de conteúdo — imagem e fonte caem fora. */
function ehFluxoDeTexto(bytes: Buffer): boolean {
  const inicio = bytes.subarray(0, 4096).toString("latin1");
  return inicio.includes("BT") || inicio.includes("Tj") || inicio.includes("TJ");
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
 * Devolve o texto e onde a string terminou.
 */
function lerString(fonte: string, inicio: number): { texto: string; fim: number } | null {
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

    return { texto: saida, fim: i + 1 };
  }

  if (fonte[inicio] === "<" && fonte[inicio + 1] !== "<") {
    const fim = fonte.indexOf(">", inicio);
    if (fim === -1) return null;
    const hex = fonte.slice(inicio + 1, fim).replace(/\s/g, "");
    const pares = hex.match(/.{1,2}/g) ?? [];
    const bytes = pares.map((p) => parseInt(p.padEnd(2, "0"), 16));

    // Um em cada dois bytes zerado é a assinatura de UTF-16BE, que é como o
    // texto acentuado costuma sair de gerador moderno.
    const ehUtf16 =
      bytes.length >= 4 && bytes.length % 2 === 0 && bytes.filter((b, i) => i % 2 === 0 && b === 0).length > bytes.length / 4;

    return {
      texto: ehUtf16 ? decodificarUtf16be(bytes) : Buffer.from(bytes).toString("latin1"),
      fim: fim + 1,
    };
  }

  return null;
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
function textoDoFluxo(fluxo: string): string {
  let saida = "";
  let i = 0;

  while (i < fluxo.length) {
    const c = fluxo[i];

    if (c === "(" || (c === "<" && fluxo[i + 1] !== "<")) {
      const lido = lerString(fluxo, i);
      if (!lido) {
        i++;
        continue;
      }
      saida += lido.texto;
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
          saida += lido.texto;
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

/**
 * Texto de um PDF, página a página, na ordem em que aparece no arquivo.
 * Devolve string vazia quando o PDF não tem texto extraível.
 */
export function extrairTextoDePdf(pdf: Buffer | Uint8Array): string {
  const bytes = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
  const cru = bytes.toString("latin1");

  if (!cru.startsWith("%PDF")) return "";

  const partes: string[] = [];
  let cursor = 0;

  while (partes.join("").length < LIMITE_TEXTO) {
    const inicioStream = cru.indexOf("stream", cursor);
    if (inicioStream === -1) break;

    const fimStream = cru.indexOf("endstream", inicioStream);
    if (fimStream === -1) break;

    // O dicionário do objeto vem logo antes do `stream` e diz qual filtro usar.
    const inicioDicionario = cru.lastIndexOf("<<", inicioStream);
    const dicionario = inicioDicionario === -1 ? "" : cru.slice(inicioDicionario, inicioStream);

    // Depois de `stream` vem CRLF ou LF antes dos dados.
    let dados = inicioStream + "stream".length;
    if (cru[dados] === "\r") dados++;
    if (cru[dados] === "\n") dados++;

    const bruto = bytes.subarray(dados, fimStream);
    const conteudo = descomprimir(bruto, dicionario);

    if (conteudo && ehFluxoDeTexto(conteudo)) {
      partes.push(textoDoFluxo(conteudo.toString("latin1")));
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

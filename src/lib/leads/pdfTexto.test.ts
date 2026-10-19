import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extrairTextoDePdf } from "./pdfTexto";

/**
 * Monta um PDF de verdade em memória, para o teste exercitar o extrator
 * contra a estrutura real do formato em vez de uma string fingindo ser um
 * arquivo. É o mesmo esqueleto que qualquer gerador produz: catálogo,
 * páginas, página e um fluxo de conteúdo com operadores de texto.
 */
function criarPdf(conteudo: string, opcoes: { comprimir?: boolean } = {}): Buffer {
  const fluxo = opcoes.comprimir
    ? deflateSync(Buffer.from(conteudo, "latin1"))
    : Buffer.from(conteudo, "latin1");

  const filtro = opcoes.comprimir ? " /Filter /FlateDecode" : "";

  const cabecalho = Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
      `4 0 obj << /Length ${fluxo.length}${filtro} >>`,
      "stream\n",
    ].join("\n"),
    "latin1",
  );

  const rodape = Buffer.from(
    ["\nendstream", "endobj", "trailer << /Root 1 0 R >>", "%%EOF"].join("\n"),
    "latin1",
  );

  return Buffer.concat([cabecalho, fluxo, rodape]);
}

const RELATORIO = [
  "BT",
  "/F1 12 Tf",
  "50 700 Td (Relatorio de contatos - Agosto) Tj",
  "0 -20 Td (Ana Prado \\(11\\) 99123-4567 ana@exemplo.com) Tj",
  "0 -20 Td (Bruno Lima 11987654321 bruno@exemplo.com) Tj",
  "0 -20 Td (Carla Souza 11 98888-7777) Tj",
  "ET",
].join("\n");

describe("Extração de texto de PDF", () => {
  it("lê um fluxo de conteúdo sem compressão", () => {
    const texto = extrairTextoDePdf(criarPdf(RELATORIO));

    expect(texto).toContain("Ana Prado");
    expect(texto).toContain("(11) 99123-4567");
    expect(texto).toContain("bruno@exemplo.com");
  });

  it("descomprime fluxo em FlateDecode, que é o caso comum", () => {
    const texto = extrairTextoDePdf(criarPdf(RELATORIO, { comprimir: true }));

    expect(texto).toContain("Ana Prado");
    expect(texto).toContain("Carla Souza");
  });

  it("separa cada registro em sua própria linha", () => {
    const linhas = extrairTextoDePdf(criarPdf(RELATORIO, { comprimir: true }))
      .split("\n")
      .filter(Boolean);

    expect(linhas.some((l) => l.includes("Ana Prado") && l.includes("99123-4567"))).toBe(true);
    // Nome de um contato não pode vazar para a linha do outro.
    expect(linhas.some((l) => l.includes("Ana Prado") && l.includes("Bruno Lima"))).toBe(false);
  });

  it("junta as partes de um array TJ, respeitando o espaço entre palavras", () => {
    /*
     * Em TJ o ajuste é em milésimos de em: dentro da palavra é kerning
     * (dezenas), entre palavras é o espaço (centenas). O extrator usa essa
     * diferença de ordem de grandeza para saber onde cabe um espaço — daí o
     * -20 colar as sílabas e o -300 separar as palavras.
     */
    const conteudo = "BT /F1 12 Tf 50 700 Td [(Dieg) -20 (o) -300 (Alv) -15 (es)] TJ ET";

    expect(extrairTextoDePdf(criarPdf(conteudo))).toContain("Diego Alves");
  });

  it("lê string hexadecimal", () => {
    // "Ana" em hexadecimal simples.
    const conteudo = "BT /F1 12 Tf 50 700 Td <416E61> Tj ET";

    expect(extrairTextoDePdf(criarPdf(conteudo))).toContain("Ana");
  });

  it("devolve vazio para arquivo que não é PDF", () => {
    expect(extrairTextoDePdf(Buffer.from("isto nao e um pdf", "utf8"))).toBe("");
  });

  it("devolve vazio para PDF sem texto — o caso do escaneado", () => {
    // Fluxo de imagem: nenhum operador de texto, nada a extrair.
    const imagem = "q 500 0 0 700 50 50 cm /Im0 Do Q";

    expect(extrairTextoDePdf(criarPdf(imagem, { comprimir: true }))).toBe("");
  });
});

/**
 * A tabela de preço da construtora (Winnovative, 02/10/2026): fonte Type0 com
 * `/Identity-H`, que grava o NÚMERO DO GLIFO e só vira letra pelo
 * `/ToUnicode`; e o texto vem depois de muitos KB de retângulos da grade.
 * Antes desta correção o extrator devolvia "7RGDV" no lugar de "Todas" e
 * descartava a tabela inteira.
 */
describe("tabela de preço gerada de HTML", () => {
  // Glifo = código ASCII - 29, como no arquivo real ("T" 0x54 → 0x37).
  const glifo = (texto: string) =>
    "<" + [...texto].map((c) => (c.charCodeAt(0) - 29).toString(16).padStart(4, "0")).join("") + ">";
  const cmap = [
    "/CIDInit /ProcSet findresource begin",
    "begincmap",
    "1 begincodespacerange <0000> <FFFF> endcodespacerange",
    "1 beginbfrange",
    "<0003> <005D> <0020>",
    "endbfrange",
    "1 beginbfchar",
    "<00A0> <00E7>",
    "endbfchar",
    "endcmap",
  ].join("\n");

  function tabela(): Buffer {
    const grade = "8.00000 708.00000 m\n1016.00000 708.00000 l\nh\nf*\n".repeat(400);
    const conteudo = `${grade}BT\n/AYBQCF+Tahoma 9 Tf\n10 600 Td ${glifo("T1-1704")} Tj\n0 -12 Td ${glifo("608.923,68")} Tj\n0 -12 Td [${glifo("Valor")} -300 ${glifo("total")}] TJ\n0 -12 Td <003400A00052> Tj\nET`;
    const fluxo = deflateSync(Buffer.from(conteudo, "latin1"));
    const partes = [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /XObject << /W1 4 0 R >> >> >> endobj",
      `5 0 obj << /Type /Font /Subtype /Type0 /Encoding /Identity-H /ToUnicode 6 0 R >> endobj`,
      `6 0 obj << /Length ${cmap.length} >>\nstream\n${cmap}\nendstream\nendobj`,
      `4 0 obj << /Type /XObject /Resources << /Font << /AYBQCF+Tahoma 5 0 R >> >> /Subtype /Form /Filter /FlateDecode /Length ${fluxo.length} >>\nstream\n`,
    ];
    return Buffer.concat([
      Buffer.from(partes.join("\n"), "latin1"),
      fluxo,
      Buffer.from("\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF", "latin1"),
    ]);
  }

  it("decodifica a fonte pelo /ToUnicode, mesmo com o texto depois da grade", () => {
    const texto = extrairTextoDePdf(tabela());
    expect(texto).toContain("T1-1704");
    expect(texto).toContain("608.923,68");
    expect(texto).toContain("Valor total");
    // bfchar: o glifo 00A0 é "ç", fora da faixa do bfrange.
    expect(texto).toContain("Qço");
  });
});

/**
 * PDF que posiciona LETRA POR LETRA (Canva, exportação de design, o tabelão
 * da RSF de 13/10/2026). Antes, todo `Td`/`Tm` virava quebra de linha e o
 * texto saía com uma letra por linha: "T\nE\nS\nT\nE", e o preço
 * "381.405,62" em dez linhas, que a leitura de tabela não reconhecia.
 */
describe("PDF que desenha cada letra numa posição própria", () => {
  /** Uma letra por `Tm`, avançando `passo` pontos, na linha de base `y`. */
  function letraPorLetra(texto: string, x: number, y: number, passo = 6.6, tamanho = 12): string {
    return [...texto]
      .map((c, k) =>
        c === " "
          ? ""
          : `1 0 0 1 ${(x + k * passo).toFixed(2)} ${y} Tm (${c.replace(/[()\\]/g, (m) => "\\" + m)}) Tj`,
      )
      .filter(Boolean)
      .join("\n");
  }

  it("junta as letras da mesma linha e separa as palavras", () => {
    const conteudo = [
      "BT /F1 12 Tf",
      letraPorLetra("TESTE", 50, 700),
      letraPorLetra("Breeze Home Clube", 50, 680),
      letraPorLetra("R$ 381.405,62", 50, 660),
      "ET",
    ].join("\n");

    const linhas = extrairTextoDePdf(criarPdf(conteudo, { comprimir: true })).split("\n");
    expect(linhas).toEqual(["TESTE", "Breeze Home Clube", "R$ 381.405,62"]);
  });

  it("mede a letra pela largura da fonte quando o arquivo diz", () => {
    // Fonte com /Widths: "W" largo (944) e "i" estreito (222). Com a largura
    // de verdade, letras coladas não ganham espaço no meio.
    const larguras = Array.from({ length: 95 }, (_, k) => {
      const c = String.fromCharCode(32 + k);
      return c === "W" ? 944 : c === "i" ? 222 : c === " " ? 278 : 556;
    });
    const avancos = (t: string) => [...t].map((c) => larguras[c.charCodeAt(0) - 32] * 0.012);
    const desenhar = (t: string, x: number, y: number) => {
      let pos = x;
      const ops: string[] = [];
      avancos(t).forEach((w, k) => {
        if (t[k] !== " ") ops.push(`1 0 0 1 ${pos.toFixed(3)} ${y} Tm (${t[k]}) Tj`);
        pos += w;
      });
      return ops.join("\n");
    };
    const conteudo = `BT /F1 12 Tf\n${desenhar("Wi Wi", 50, 700)}\nET`;
    const fluxo = deflateSync(Buffer.from(conteudo, "latin1"));
    const partes = [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj",
      `5 0 obj << /Type /Font /Subtype /TrueType /FirstChar 32 /LastChar 126 /Widths [${larguras.join(" ")}] >> endobj`,
      `4 0 obj << /Length ${fluxo.length} /Filter /FlateDecode >>\nstream\n`,
    ];
    const pdf = Buffer.concat([
      Buffer.from(partes.join("\n"), "latin1"),
      fluxo,
      Buffer.from("\nendstream\nendobj\ntrailer << /Root 1 0 R >>\n%%EOF", "latin1"),
    ]);
    expect(extrairTextoDePdf(pdf)).toBe("Wi Wi");
  });

  it("respeita a escala da matriz (fonte de tamanho 1 com Tm 12)", () => {
    const conteudo = [
      "BT /F1 1 Tf",
      "12 0 0 12 50 700 Tm (Valor) Tj",
      "12 0 0 12 86 700 Tm (total) Tj",
      "12 0 0 12 50 680 Tm (608.923,68) Tj",
      "ET",
    ].join("\n");
    expect(extrairTextoDePdf(criarPdf(conteudo)).split("\n")).toEqual(["Valor total", "608.923,68"]);
  });

  it("ignora o binário de uma imagem embutida no meio do texto", () => {
    const conteudo = "BT /F1 12 Tf 50 700 Td (Antes) Tj ET\nBI /W 2 /H 1 /BPC 8 /CS /G ID \x00Tj(X)Tj\xff EI\nBT /F1 12 Tf 50 680 Td (Depois) Tj ET";
    expect(extrairTextoDePdf(criarPdf(conteudo)).split("\n")).toEqual(["Antes", "Depois"]);
  });
});

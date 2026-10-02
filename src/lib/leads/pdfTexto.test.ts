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

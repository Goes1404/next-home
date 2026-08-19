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

import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { dedupInterno, extrairDePdf, parsearTabelaLeads } from "./importacao";

describe("Importação de leads — tabela com cabeçalho", () => {
  it("lê um CSV com ponto e vírgula e cabeçalho em português", () => {
    const csv = [
      "nome;telefone;email",
      "Ana Prado;(11) 99123-4567;ana@exemplo.com",
      "Bruno Lima;11987654321;bruno@exemplo.com",
    ].join("\n");

    const linhas = parsearTabelaLeads(csv);

    expect(linhas).toHaveLength(2);
    expect(linhas[0].nome).toBe("Ana Prado");
    expect(linhas[0].telefoneE164).toBe("5511991234567");
    expect(linhas[1].email).toBe("bruno@exemplo.com");
  });

  it("aceita colagem do Excel, separada por tabulação", () => {
    const colado = "Nome\tCelular\tE-mail\nCarla Souza\t11 98888-7777\tcarla@exemplo.com";

    const linhas = parsearTabelaLeads(colado);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].telefoneE164).toBe("5511988887777");
  });

  it("reconhece cabeçalhos alternativos e traz mensagem e imóvel", () => {
    const csv = [
      "Cliente,WhatsApp,Observação,Empreendimento",
      "Diego Alves,11 97777-6666,Quer visitar no sábado,Reserva Alphaville",
    ].join("\n");

    const [lead] = parsearTabelaLeads(csv);

    expect(lead.nome).toBe("Diego Alves");
    expect(lead.mensagem).toBe("Quer visitar no sábado");
    expect(lead.imovelInteresse).toBe("Reserva Alphaville");
  });

  it("descarta a linha cujo telefone não é aproveitável", () => {
    const csv = ["nome;telefone", "Sem Telefone;-", "Elisa Prado;11 96666-5555"].join("\n");

    const linhas = parsearTabelaLeads(csv);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].nome).toBe("Elisa Prado");
  });
});

describe("Importação de leads — tabela sem cabeçalho", () => {
  it("descobre as colunas pelo conteúdo", () => {
    const csv = "Fernanda Dias;(11) 95555-4444;fernanda@exemplo.com";

    const [lead] = parsearTabelaLeads(csv);

    expect(lead.nome).toBe("Fernanda Dias");
    expect(lead.telefoneE164).toBe("5511955554444");
    expect(lead.email).toBe("fernanda@exemplo.com");
  });

  it("aceita contato sem nome, porque o telefone é o que vale", () => {
    const [lead] = parsearTabelaLeads("11 94444-3333");

    expect(lead.nome).toBe("Contato sem nome");
    expect(lead.telefoneE164).toBe("5511944443333");
  });

  it("não confunde preço nem data com telefone", () => {
    // Uma planilha de preços não pode virar lista de clientes.
    expect(parsearTabelaLeads("Residencial Alphaville;1.500.000,00")).toHaveLength(0);
    expect(parsearTabelaLeads("Entrega;30/06/2027")).toHaveLength(0);
  });

  it("ignora conteúdo vazio", () => {
    expect(parsearTabelaLeads("")).toHaveLength(0);
    expect(parsearTabelaLeads("   \n  \n")).toHaveLength(0);
  });
});

describe("Importação de leads — deduplicação interna", () => {
  it("mantém só a primeira ocorrência de cada telefone, em formatos diferentes", () => {
    const csv = [
      "nome;telefone",
      "Ana Prado;(11) 99123-4567",
      "Ana P.;11991234567",
      "Bruno Lima;11 98765-4321",
    ].join("\n");

    const unicos = dedupInterno(parsearTabelaLeads(csv));

    expect(unicos).toHaveLength(2);
    expect(unicos[0].nome).toBe("Ana Prado");
  });
});

/** Parênteses e barra delimitam string no PDF; dentro do texto vão escapados. */
function escaparPdf(texto: string): string {
  return texto.replace(/[\\()]/g, (c) => `\\${c}`);
}

/** PDF de verdade em memória, com fluxo comprimido como um gerador real faz. */
function pdfCom(linhas: string[]): Buffer {
  const conteudo = [
    "BT",
    "/F1 12 Tf",
    ...linhas.map((l, i) => `50 ${700 - i * 20} Td (${escaparPdf(l)}) Tj`),
    "ET",
  ].join("\n");

  const fluxo = deflateSync(Buffer.from(conteudo, "latin1"));

  return Buffer.concat([
    Buffer.from(
      [
        "%PDF-1.4",
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
        "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
        `4 0 obj << /Length ${fluxo.length} /Filter /FlateDecode >>`,
        "stream\n",
      ].join("\n"),
      "latin1",
    ),
    fluxo,
    Buffer.from(["\nendstream", "endobj", "trailer << /Root 1 0 R >>", "%%EOF"].join("\n"), "latin1"),
  ]);
}

describe("Importação de leads — PDF", () => {
  /*
   * Não há GEMINI_API_KEY no ambiente de teste, e é justamente esse o ponto:
   * PDF de texto precisa funcionar sem depender de chave de API nenhuma.
   */
  it("lê contatos de um PDF de texto sem recorrer à IA", async () => {
    const pdf = pdfCom([
      "Relatorio de contatos - Agosto",
      "Ana Prado (11) 99123-4567 ana@exemplo.com",
      "Bruno Lima 11987654321 bruno@exemplo.com",
    ]);

    const resultado = await extrairDePdf(pdf);

    expect(resultado.metodo).toBe("texto");
    expect(resultado.candidatos.map((c) => c.telefoneE164)).toEqual(
      expect.arrayContaining(["5511991234567", "5511987654321"]),
    );
  });

  it("lê a tabela do PDF quando ela vem com separador", async () => {
    const pdf = pdfCom(["nome;telefone;email", "Carla Souza;11 98888-7777;carla@exemplo.com"]);

    const resultado = await extrairDePdf(pdf);

    expect(resultado.metodo).toBe("texto");
    expect(resultado.candidatos).toHaveLength(1);
    expect(resultado.candidatos[0].nome).toBe("Carla Souza");
    expect(resultado.candidatos[0].email).toBe("carla@exemplo.com");
  });

  it("avisa que o PDF é escaneado quando não há texto nem IA disponível", async () => {
    const semTexto = pdfCom([]);

    const resultado = await extrairDePdf(semTexto);

    expect(resultado.candidatos).toHaveLength(0);
    expect(resultado.aviso).toMatch(/escaneado/i);
  });
});

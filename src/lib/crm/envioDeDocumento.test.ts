import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dicaDoDocumento, formatoDoArquivo, motivoDaFalhaDeEnvio } from "./envioDeDocumento";
import { DOCUMENTOS_DO_CONTRATO } from "./documentacao";
import { documentosDoPerfil, PERFIS_DE_DOCUMENTO, problemaDoArquivo } from "./linksDoCliente";

describe("formatoDoArquivo", () => {
  it("usa o tipo que o aparelho informou", () => {
    expect(formatoDoArquivo({ type: "application/pdf", name: "x.bin" })).toBe("application/pdf");
  });

  it("tipo vazio (HEIC no Android) sai da extensão", () => {
    expect(formatoDoArquivo({ type: "", name: "IMG_0001.HEIC" })).toBe("image/heic");
    expect(formatoDoArquivo({ type: "application/octet-stream", name: "rg.jpeg" })).toBe("image/jpeg");
  });

  it("HEIF entra como HEIC, que é o que o armazenamento aceita", () => {
    expect(formatoDoArquivo({ type: "image/heif", name: "a.heif" })).toBe("image/heic");
    expect(formatoDoArquivo({ type: "", name: "a.heif" })).toBe("image/heic");
  });

  it("formato que não aceitamos continua recusado", () => {
    expect(problemaDoArquivo({ size: 10, type: "", name: "planilha.xlsx" })).toMatch(/Formato não aceito/);
    expect(problemaDoArquivo({ size: 10, type: "", name: "foto.heic" })).toBeNull();
  });
});

describe("motivoDaFalhaDeEnvio", () => {
  it("arquivo grande não vira 'sem conexão'", () => {
    expect(motivoDaFalhaDeEnvio(new Error("Payload too large"))).toMatch(/grande demais/);
    expect(motivoDaFalhaDeEnvio({ message: "The object exceeded the maximum allowed size" })).toMatch(/grande demais/);
  });

  it("rede fora diz sem internet, e que nada se perdeu", () => {
    expect(motivoDaFalhaDeEnvio(new TypeError("Failed to fetch"))).toMatch(/Sem internet.*nada se perdeu/);
    expect(motivoDaFalhaDeEnvio(new TypeError("Load failed"))).toMatch(/Sem internet/);
  });

  it("formato e autorização vencida têm frase própria", () => {
    expect(motivoDaFalhaDeEnvio({ message: "mime type image/gif is not supported" })).toMatch(/Formato não aceito/);
    expect(motivoDaFalhaDeEnvio({ message: "invalid signature" })).toMatch(/autorização/);
  });

  it("o resto não finge ser falta de conexão", () => {
    expect(motivoDaFalhaDeEnvio(new Error("Internal Server Error"))).not.toMatch(/conexão|internet/i);
  });
});

describe("dicaDoDocumento", () => {
  it("todo item das listas prontas tem dica", () => {
    const itens = [...PERFIS_DE_DOCUMENTO.flatMap(documentosDoPerfil), ...DOCUMENTOS_DO_CONTRATO];
    const semDica = [...new Set(itens)].filter((i) => !dicaDoDocumento(i));
    expect(semDica).toEqual([]);
  });

  it("casa sem depender de acento nem caixa", () => {
    expect(dicaDoDocumento("comprovante de residência")).toMatch(/90 dias/);
    expect(dicaDoDocumento("RG OU CNH")).toMatch(/Frente e verso/);
  });

  it("o CPF não recebe a dica do RG que ele cita", () => {
    expect(dicaDoDocumento("CPF (se não estiver no RG/CNH)")).toMatch(/Só se o número/);
  });

  it("união estável não recebe a dica de solteiro", () => {
    expect(dicaDoDocumento("Certidão de casamento ou declaração de união estável")).toMatch(/união estável/);
  });

  it("item que o corretor inventou fica sem dica", () => {
    expect(dicaDoDocumento("Foto do cachorro")).toBeNull();
  });
});

describe("o arquivo não passa pela Server Action", () => {
  // A Vercel recusa corpo acima de 4,5 MB antes do nosso código: foto de
  // celular e PDF escaneado morriam ali, com a tela dizendo "sem conexão".
  // A guarda lê o código: nenhuma das duas ações volta a receber o arquivo.
  const acoes = [
    "src/app/(institucional)/documentos/[token]/acoes.ts",
    "src/app/corretor/(painel)/leads/[id]/documentacaoAcoes.ts",
  ];
  it.each(acoes)("%s não recebe File", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf8");
    expect(fonte).not.toMatch(/instanceof File/);
    expect(fonte).not.toMatch(/\.upload\(/);
    expect(fonte).toMatch(/autorizarEnvio\(/);
    expect(fonte).toMatch(/conferirArquivoEnviado\(/);
  });
});

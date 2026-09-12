import { describe, expect, it } from "vitest";
import { montarZip } from "../../../test/zipDeTeste";
import { lerZip } from "./zipLeitura";

describe("Leitor de ZIP", () => {
  it("lê uma entrada comprimida com deflate", () => {
    const zip = montarZip([{ nome: "conversa.txt", conteudo: "oi".repeat(500) }]);
    const leitura = lerZip(zip);

    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(leitura.arquivos[0].nome).toBe("conversa.txt");
    expect(leitura.arquivos[0].conteudo.toString("utf8")).toBe("oi".repeat(500));
  });

  it("lê uma entrada guardada sem compressão", () => {
    const zip = montarZip([{ nome: "a.txt", conteudo: "cru", comprimir: false }]);
    const leitura = lerZip(zip);

    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(leitura.arquivos[0].conteudo.toString("utf8")).toBe("cru");
  });

  it("usa o campo extra do cabeçalho LOCAL, não o do diretório central", () => {
    // Com o número errado, os dados saem deslocados em 16 bytes e o inflate
    // falha — sem dizer nada sobre a causa.
    const zip = montarZip([{ nome: "a.txt", conteudo: "alinhado", extraLocal: 16 }]);
    const leitura = lerZip(zip);

    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(leitura.arquivos[0].conteudo.toString("utf8")).toBe("alinhado");
  });

  it("não descomprime o que o filtro recusa", () => {
    const zip = montarZip([
      { nome: "IMG-001.jpg", conteudo: Buffer.alloc(2000, 7) },
      { nome: "conversa.txt", conteudo: "oi" },
    ]);

    const leitura = lerZip(zip, { aceitar: (nome) => nome.endsWith(".txt") });

    expect(leitura.ok).toBe(true);
    if (!leitura.ok) return;
    expect(leitura.arquivos).toHaveLength(1);
    expect(leitura.arquivos[0].nome).toBe("conversa.txt");
  });

  it("recusa o que não é ZIP, com motivo", () => {
    expect(lerZip(Buffer.from("isto é um PDF, não um zip"))).toEqual({
      ok: false,
      motivo: "nao_e_zip",
    });
  });

  it("recusa quando o conteúdo descomprimido passa do teto", () => {
    const zip = montarZip([{ nome: "bomba.txt", conteudo: "a".repeat(50_000) }]);
    const leitura = lerZip(zip, { limiteDescomprimido: 1000 });

    expect(leitura).toEqual({ ok: false, motivo: "corrompido" });
  });

  it("recusa arquivo protegido por senha em vez de devolver lixo", () => {
    const zip = montarZip([{ nome: "a.txt", conteudo: "segredo" }]);
    // Liga o bit 0 das flags no diretório central (o começo do diretório é o
    // fim dos dados locais, e o `fim` tem 22 bytes).
    const fim = zip.length - 22;
    const inicioDoDiretorio = zip.readUInt32LE(fim + 16);
    zip.writeUInt16LE(0x801, inicioDoDiretorio + 8);

    expect(lerZip(zip)).toEqual({ ok: false, motivo: "protegido_por_senha" });
  });
});

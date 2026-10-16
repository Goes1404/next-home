import { describe, expect, it } from "vitest";
import { lerZip } from "@/lib/leads/zipLeitura";
import { montarZipSemCompressao } from "./zipNoNavegador";

describe("zip montado no navegador", () => {
  it("o leitor de zip da casa abre o que ele monta, com nome acentuado e binário intacto", () => {
    const binario = new Uint8Array(256).map((_, i) => i);
    const zip = montarZipSemCompressao([
      { nome: "01 - RG ou CNH.jpg", conteudo: binario },
      { nome: "02 - Certidão.pdf", conteudo: new TextEncoder().encode("%PDF-1.4 teste") },
    ]);
    const lido = lerZip(Buffer.from(zip));
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    expect(lido.arquivos.map((a) => a.nome)).toEqual(["01 - RG ou CNH.jpg", "02 - Certidão.pdf"]);
    expect([...lido.arquivos[0].conteudo]).toEqual([...binario]);
    expect(lido.arquivos[1].conteudo.toString("utf8")).toBe("%PDF-1.4 teste");
  });
});

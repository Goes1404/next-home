import { describe, expect, it } from "vitest";
import {
  alertaDeResolucao,
  caminhoDoLink,
  documentosDoPerfil,
  documentosQueFaltam,
  textoDoAvisoDoLink,
  linkValido,
  mensagemParaCliente,
  nomeSeguro,
  problemaDoArquivo,
  TETO_DOCUMENTO_BYTES,
} from "./linksDoCliente";

describe("links para o cliente", () => {
  it("monta o caminho de cada tipo", () => {
    expect(caminhoDoLink("selecao", "abc")).toBe("/selecao/abc");
    expect(caminhoDoLink("documentos", "abc")).toBe("/documentos/abc");
  });

  it("a mensagem leva o link e o primeiro nome", () => {
    const m = mensagemParaCliente({ tipo: "documentos", primeiroNome: "Ana", url: "https://x/documentos/1" });
    expect(m).toMatch(/^Oi, Ana!/);
    expect(m).toContain("https://x/documentos/1");
  });

  it("nome de arquivo sai sem acento, barra ou caminho", () => {
    expect(nomeSeguro("Holerite março/2026.pdf")).toBe("Holerite-marco-2026.pdf");
    expect(nomeSeguro("../../etc")).toBe("etc");
    expect(nomeSeguro("///")).toBe("arquivo");
  });

  it("recusa arquivo grande, vazio ou de formato estranho", () => {
    expect(problemaDoArquivo({ size: 100, type: "application/pdf" })).toBeNull();
    expect(problemaDoArquivo({ size: TETO_DOCUMENTO_BYTES + 1, type: "image/jpeg" })).toMatch(/10 MB/);
    expect(problemaDoArquivo({ size: 0, type: "image/jpeg" })).toMatch(/vazio/);
    expect(problemaDoArquivo({ size: 10, type: "application/x-msdownload" })).toMatch(/Formato/);
  });

  it("link vencido não vale", () => {
    const agora = new Date("2026-09-26T12:00:00Z");
    expect(linkValido({ expira_em: "2026-10-01T00:00:00Z" }, agora)).toBe(true);
    expect(linkValido({ expira_em: "2026-09-01T00:00:00Z" }, agora)).toBe(false);
    expect(linkValido(null, agora)).toBe(false);
  });
});

describe("documentos por perfil, legibilidade e avisos", () => {
  it("cada perfil pede a lista dele", () => {
    expect(documentosDoPerfil("clt")).toContain("3 últimos holerites ou comprovante de renda");
    expect(documentosDoPerfil("autonomo").join(" ")).not.toMatch(/holerite/);
    expect(documentosDoPerfil("autonomo")).toContain("Extratos bancários dos últimos 6 meses");
    expect(documentosDoPerfil("casal").join(" ")).toMatch(/dos dois/);
  });

  it("foto pequena ganha aviso; grande e sem medida não", () => {
    expect(alertaDeResolucao(600, 800)).toMatch(/600×800/);
    expect(alertaDeResolucao(1200, 1600)).toBeNull();
    expect(alertaDeResolucao(undefined, undefined)).toBeNull();
  });

  it("faltam os itens sem arquivo", () => {
    expect(documentosQueFaltam(["A", "B", "C"], ["A", "A", "C"])).toEqual(["B"]);
    expect(documentosQueFaltam(["A"], ["A"])).toEqual([]);
  });

  it("só abertura, primeiro documento e lista completa viram aviso", () => {
    const base = { nome: "Ana Prado", detalhe: null, fichaUrl: "https://x/corretor/leads/1" };
    expect(textoDoAvisoDoLink({ ...base, tipo: "abriu" })).toMatch(/Ana Prado abriu/);
    expect(textoDoAvisoDoLink({ ...base, tipo: "documentos_completos" })).toMatch(/todos os documentos/);
    expect(textoDoAvisoDoLink({ ...base, tipo: "clicou" })).toBeNull();
    expect(textoDoAvisoDoLink({ ...base, nome: null, tipo: "abriu" })).toMatch(/^👀 Seu cliente/);
  });
});

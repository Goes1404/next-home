import { describe, expect, it } from "vitest";
import {
  DOCUMENTOS_DO_CONTRATO,
  itensIniciais,
  listaEfetiva,
  mensagemDeRecusa,
  mesmoItem,
  nomeDoZip,
  nomesNoZip,
  normalizarItem,
  resumirLista,
  situacaoDoItem,
  sugereDocumentacao,
  type DocumentoDaLista,
} from "./documentacao";

function doc(item: string, situacao: DocumentoDaLista["situacao"], criadoEm = "2026-10-16T10:00:00Z", motivo: string | null = null): DocumentoDaLista {
  return { id: `${item}-${criadoEm}`, item, situacao, motivoRecusa: motivo, criadoEm };
}

describe("situação do item", () => {
  it("sem arquivo falta", () => {
    expect(situacaoDoItem([])).toBe("falta");
  });

  it("um conferido basta, mesmo com recusado ao lado", () => {
    expect(situacaoDoItem([{ situacao: "recusado" }, { situacao: "conferido" }])).toBe("conferido");
  });

  it("mandou de novo depois da recusa: volta a esperar conferência", () => {
    expect(situacaoDoItem([{ situacao: "recusado" }, { situacao: "recebido" }])).toBe("recebido");
  });

  it("só recusados: recusado", () => {
    expect(situacaoDoItem([{ situacao: "recusado" }])).toBe("recusado");
  });
});

describe("resumo da lista", () => {
  const itens = ["RG ou CNH", "Comprovante de residência", "Extrato do FGTS"];

  it("conta o que falta, o que espera conferência e o que está pronto", () => {
    const r = resumirLista(itens, [doc("RG ou CNH", "conferido"), doc("Comprovante de residência", "recebido")]);
    expect(r.conferidos).toBe(1);
    expect(r.aConferir).toBe(1);
    expect(r.pendentesDoCliente).toEqual(["Extrato do FGTS"]);
    expect(r.completa).toBe(false);
    expect(r.pronta).toBe(false);
  });

  it("recusado conta como pendente do cliente, com o motivo mais recente", () => {
    const r = resumirLista(["RG ou CNH"], [
      doc("RG ou CNH", "recusado", "2026-10-15T10:00:00Z", "Vencido"),
      doc("RG ou CNH", "recusado", "2026-10-16T10:00:00Z", "Ilegível"),
    ]);
    expect(r.itens[0].situacao).toBe("recusado");
    expect(r.itens[0].motivo).toBe("Ilegível");
    expect(r.pendentesDoCliente).toEqual(["RG ou CNH"]);
  });

  it("completa não é pronta: falta o corretor conferir", () => {
    const r = resumirLista(["RG ou CNH"], [doc("RG ou CNH", "recebido")]);
    expect(r.completa).toBe(true);
    expect(r.pronta).toBe(false);
  });

  it("pronta quando todo item foi conferido", () => {
    const r = resumirLista(["RG ou CNH", "Extrato do FGTS"], [doc("rg ou cnh", "conferido"), doc("Extrato do FGTS", "conferido")]);
    expect(r.pronta).toBe(true);
  });

  it("lista vazia nunca é pronta nem completa", () => {
    const r = resumirLista([], []);
    expect(r.pronta).toBe(false);
    expect(r.completa).toBe(false);
  });

  it("arquivo de item que saiu da lista vira avulso, não some", () => {
    const r = resumirLista(["RG ou CNH"], [doc("Holerite antigo", "recebido")]);
    expect(r.avulsos.map((a) => a.item)).toEqual(["Holerite antigo"]);
  });
});

describe("listas", () => {
  it("a lista gravada ganha da lista do link antigo", () => {
    expect(listaEfetiva({ gravada: ["A"], doLink: ["B"] })).toEqual(["A"]);
    expect(listaEfetiva({ gravada: null, doLink: ["B"] })).toEqual(["B"]);
    expect(listaEfetiva({ gravada: null, doLink: null })).toEqual([]);
  });

  it("lista gravada VAZIA vale: o corretor tirou tudo de propósito", () => {
    expect(listaEfetiva({ gravada: [], doLink: ["B"] })).toEqual([]);
  });

  it("o contrato parte da lista da construtora; o financiamento, do perfil", () => {
    expect(itensIniciais("contrato")).toEqual([...DOCUMENTOS_DO_CONTRATO]);
    expect(itensIniciais("financiamento", "autonomo")).toContain("Extratos bancários dos últimos 6 meses");
    expect(itensIniciais("financiamento", "inventado")).toContain("3 últimos holerites ou comprovante de renda");
  });

  it("item digitado perde espaço sobrando e vazio não entra", () => {
    expect(normalizarItem("  Certidão   de  casamento ")).toBe("Certidão de casamento");
    expect(normalizarItem("   ")).toBeNull();
  });

  it("mesmo item ignora caixa e acento", () => {
    expect(mesmoItem("Comprovante de Residência", "comprovante de residencia")).toBe(true);
    expect(mesmoItem("RG", "CPF")).toBe(false);
  });
});

describe("sugestão de mover para Documentação", () => {
  it("lista pronta e lead antes da etapa: sugere", () => {
    expect(sugereDocumentacao("proposta", true)).toBe(true);
    expect(sugereDocumentacao("qualificado", true)).toBe(true);
  });

  it("não sugere sem lista pronta, nem para quem já chegou, nem para perdido", () => {
    expect(sugereDocumentacao("proposta", false)).toBe(false);
    expect(sugereDocumentacao("documentacao", true)).toBe(false);
    expect(sugereDocumentacao("fechado", true)).toBe(false);
    expect(sugereDocumentacao("perdido", true)).toBe(false);
  });
});

describe("zip", () => {
  it("numera pela lista, usa o nome do item e não repete nome", () => {
    expect(
      nomesNoZip([
        { item: "RG ou CNH", posicao: 1, mime: "image/jpeg", nomeArquivo: "IMG_1.jpeg" },
        { item: "RG ou CNH", posicao: 1, mime: "image/jpeg", nomeArquivo: "IMG_2.jpeg" },
        { item: "Declaração do IR (com recibo)", posicao: 7, mime: "application/pdf", nomeArquivo: null },
        { item: "Holerite 08/2026", posicao: 3, mime: null, nomeArquivo: "holerite.PDF" },
      ]),
    ).toEqual([
      "01 - RG ou CNH.jpg",
      "01 - RG ou CNH (2).jpg",
      "07 - Declaracao do IR (com recibo).pdf",
      "03 - Holerite 08 2026.pdf",
    ]);
  });

  it("nome do arquivo .zip pelo primeiro nome do lead", () => {
    expect(nomeDoZip("Ana Prado", "financiamento")).toBe("documentos-ana-financiamento.zip");
    expect(nomeDoZip("  ", "contrato")).toBe("documentos-cliente-contrato.zip");
  });
});

describe("mensagem de recusa", () => {
  it("diz o item, o motivo e o caminho para mandar de novo", () => {
    expect(mensagemDeRecusa({ primeiroNome: "Ana", item: "RG ou CNH", motivo: "Ilegível", url: "https://x/documentos/t" })).toBe(
      'Oi, Ana! O documento "RG ou CNH" não deu para usar (ilegível). Pode mandar de novo pelo mesmo link: https://x/documentos/t',
    );
    expect(mensagemDeRecusa({ primeiroNome: null, item: "CPF", motivo: "Vencido", url: null })).toContain("Pode me mandar de novo por aqui?");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { desfechoDaLista, DIAS_DE_ATRIBUICAO, textoDaEntradaNaLista } from "./desfechoDaLista";

const ENVIO = "2026-09-01T15:00:00Z";
const depois = (dias: number) => new Date(new Date(ENVIO).getTime() + dias * 86_400_000).toISOString();

describe("desfechoDaLista — visita e venda de quem recebeu", () => {
  it("conta visita e venda depois do envio, dentro da janela", () => {
    expect(
      desfechoDaLista({
        itens: [{ leadId: "a", enviadoEm: ENVIO }, { leadId: "b", enviadoEm: ENVIO }],
        visitas: [{ leadId: "a", marcadaEm: depois(3) }],
        vendas: [{ leadId: "b", criadaEm: depois(20), status: "ativa" }],
      }),
    ).toEqual({ visitas: 1, vendas: 1 });
  });

  it("não credita o que veio ANTES do envio nem depois da janela", () => {
    expect(
      desfechoDaLista({
        itens: [{ leadId: "a", enviadoEm: ENVIO }],
        visitas: [{ leadId: "a", marcadaEm: depois(-1) }],
        vendas: [{ leadId: "a", criadaEm: depois(DIAS_DE_ATRIBUICAO + 1), status: "ativa" }],
      }),
    ).toEqual({ visitas: 0, vendas: 0 });
  });

  it("venda distratada não conta, e quem não recebeu não conta", () => {
    expect(
      desfechoDaLista({
        itens: [{ leadId: "a", enviadoEm: ENVIO }, { leadId: "x", enviadoEm: null }],
        visitas: [{ leadId: "x", marcadaEm: depois(1) }],
        vendas: [{ leadId: "a", criadaEm: depois(1), status: "distratada" }],
      }),
    ).toEqual({ visitas: 0, vendas: 0 });
  });

  it("cada lead conta uma vez por lista", () => {
    expect(
      desfechoDaLista({
        itens: [{ leadId: "a", enviadoEm: ENVIO }, { leadId: "a", enviadoEm: depois(2) }],
        visitas: [{ leadId: "a", marcadaEm: depois(3) }],
        vendas: [
          { leadId: "a", criadaEm: depois(4), status: "ativa" },
          { leadId: "a", criadaEm: depois(5), status: "ativa" },
        ],
      }),
    ).toEqual({ visitas: 1, vendas: 1 });
  });
});

describe("textoDaEntradaNaLista — a linha da ficha", () => {
  it("o dia é o de São Paulo, não o do servidor UTC", () => {
    // 22h de 05/10 em Brasília = 01h de 06/10 em UTC.
    expect(textoDaEntradaNaLista("Dom Parque", "2026-10-06T01:00:00Z")).toBe(
      'Entrou na lista de transmissão "Dom Parque" em 05/10',
    );
  });

  it("sem título não escreve aspas vazias", () => {
    expect(textoDaEntradaNaLista(null, "2026-10-06T15:00:00Z")).toContain("sem título");
  });

  it("a ficha lê a lista na hora da leitura, sem copiar para lead_interacoes", () => {
    const codigo = readFileSync("src/lib/crm/dadosLead.ts", "utf8");
    expect(codigo).toContain('.from("whatsapp_campanhas_fila")');
    expect(codigo).toContain("textoDaEntradaNaLista(");
  });
});

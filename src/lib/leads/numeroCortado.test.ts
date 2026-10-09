/**
 * Telefone com 55 que a planilha cortou (09/10/2026).
 *
 * O Excel e o Google Planilhas mostram número de 12 dígitos ou mais em
 * notação científica, e é o que se cola ou exporta em CSV: "5,51198E+12". A
 * importação lia os dígitos que sobravam ("55119812") como telefone sem DDD e
 * gravava "(11) 5511-9812": número que existe e é de outra pessoa. Só a tabela
 * com 55 na frente quebrava, porque 11 dígitos a planilha ainda mostra inteiro.
 */
import { describe, expect, it, vi } from "vitest";

const lerListaComIa = vi.fn();
vi.mock("./leituraPorIa", () => ({ lerListaComIa: (...a: unknown[]) => lerListaComIa(...a) }));
vi.mock("@/lib/whatsapp/llm", () => ({
  chamarLlmJson: () => {
    throw new Error("a IA não pode ser chamada com número cortado na lista");
  },
}));

import { montarZip } from "../../../test/zipDeTeste";
import { formatarTelefoneBr, lerNumeroDePlanilha, normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import {
  avisoDeNumerosCortados,
  dedupInterno,
  extrairDeTexto,
  extrairDeXlsx,
  parsearTabelaLeads,
  temNumeroCortado,
} from "./importacao";

describe("número de planilha", () => {
  it("notação científica sem todos os dígitos é cortada", () => {
    for (const mostrado of ["5,51198E+12", "5.51198E+12", "5,51198e+12", " 5,51198E12 ", "5.5119819181E+12"]) {
      expect(lerNumeroDePlanilha(mostrado), mostrado).toEqual({ tipo: "cortado", original: mostrado.trim() });
    }
  });

  it("notação com todos os dígitos e decimal de programa viram o número inteiro", () => {
    expect(lerNumeroDePlanilha("5.511981918127E+12")).toEqual({ tipo: "inteiro", digitos: "5511981918127" });
    expect(lerNumeroDePlanilha("5.5119912345670002E+12")).toEqual({ tipo: "inteiro", digitos: "5511991234567" });
    expect(lerNumeroDePlanilha("5.5119912345669998E+12")).toEqual({ tipo: "inteiro", digitos: "5511991234567" });
    expect(lerNumeroDePlanilha("5511981918127.0")).toEqual({ tipo: "inteiro", digitos: "5511981918127" });
    expect(lerNumeroDePlanilha("11981918127,00")).toEqual({ tipo: "inteiro", digitos: "11981918127" });
  });

  it("o que não é número de planilha passa direto", () => {
    for (const valor of ["(11) 98191-8127", "+55 11 98191-8127", "11.98191-8127", "1,5E+06", "2e3", "", "5,5119E+12 ligar"]) {
      expect(lerNumeroDePlanilha(valor), valor).toBeNull();
    }
  });

  it("número cortado não vira telefone, e nem a tela o formata como um", () => {
    expect(normalizarTelefoneBrasileiro("5,51198E+12")).toBeNull();
    expect(formatarTelefoneBr("5,51198E+12")).toBe("5,51198E+12");
    expect(formatarTelefoneBr("5.511981918127E+12")).toBe("(11) 98191-8127");
    expect(formatarTelefoneBr("5511981918127.0")).toBe("(11) 98191-8127");
  });
});

describe("importação com telefone cortado", () => {
  it("a linha vem em branco, marcada, e sobrevive à deduplicação", () => {
    const colado = [
      "Nome;Telefone",
      "Ana Prado;5,51198E+12",
      "Bia Reis;5,51198E+12",
      "Caio Lima;11981918127",
      "Davi Melo;5.511991234567E+12",
    ].join("\n");

    const linhas = dedupInterno(parsearTabelaLeads(colado));

    expect(linhas.map((l) => [l.nome, l.telefone, l.telefoneE164, l.telefoneCortado ?? null])).toEqual([
      ["Ana Prado", "", null, "5,51198E+12"],
      ["Bia Reis", "", null, "5,51198E+12"],
      ["Caio Lima", "11981918127", "5511981918127", null],
      ["Davi Melo", "5511991234567", "5511991234567", null],
    ]);
  });

  it("CSV do Google, com vírgula e ponto decimal", () => {
    const csv = 'full_name,phone_number\nAna Prado,5.51198E+12\n"Lima, Bruno",+5511987654321\n';
    const linhas = dedupInterno(parsearTabelaLeads(csv));
    expect(linhas.map((l) => [l.nome, l.telefoneE164, l.telefoneCortado ?? null])).toEqual([
      ["Ana Prado", null, "5.51198E+12"],
      ["Lima, Bruno", "5511987654321", null],
    ]);
  });

  it("lista sem cabeçalho com número cortado não passa pela IA", async () => {
    lerListaComIa.mockClear();
    const resultado = await extrairDeTexto("Ana Prado\t5,51198E+12\nCaio Lima\t11981918127");
    expect(lerListaComIa).not.toHaveBeenCalled();
    expect(resultado.candidatos.map((c) => [c.nome, c.telefoneE164, c.telefoneCortado ?? null])).toEqual([
      ["Ana Prado", null, "5,51198E+12"],
      ["Caio Lima", "5511981918127", null],
    ]);
  });

  it("célula de TEXTO com a notação, dentro do .xlsx, também vem marcada", async () => {
    const xlsx = montarZip([
      {
        nome: "xl/workbook.xml",
        conteudo: '<workbook xmlns:r="r"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>',
      },
      {
        nome: "xl/_rels/workbook.xml.rels",
        conteudo: '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      },
      {
        nome: "xl/worksheets/sheet1.xml",
        conteudo: `<worksheet><sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Nome</t></is></c><c r="B1" t="inlineStr"><is><t>Celular</t></is></c></row>
          <row r="2"><c r="A2" t="inlineStr"><is><t>Ana</t></is></c><c r="B2" t="inlineStr"><is><t>5,51198E+12</t></is></c></row>
          <row r="3"><c r="A3" t="inlineStr"><is><t>Bia</t></is></c><c r="B3"><v>5511987654321</v></c></row>
        </sheetData></worksheet>`,
      },
    ]);

    const resultado = await extrairDeXlsx(xlsx);

    expect(resultado.candidatos.map((c) => [c.nome, c.telefoneE164, c.telefoneCortado ?? null])).toEqual([
      ["Ana", null, "5,51198E+12"],
      ["Bia", "5511987654321", null],
    ]);
  });

  it("o aviso diz quantos, por quê e como trazer o número inteiro", () => {
    const linhas = dedupInterno(parsearTabelaLeads("Nome;Telefone\nAna;5,51198E+12\nBia;5,51198E+12"));
    const aviso = avisoDeNumerosCortados(linhas) ?? "";
    expect(aviso).toContain("2 telefones vieram cortados");
    expect(aviso).toContain("5,51198E+12");
    expect(aviso).toContain(".xlsx");
    expect(avisoDeNumerosCortados(parsearTabelaLeads("Nome;Telefone\nCaio;11981918127"))).toBeUndefined();
  });

  it("acha o número cortado no meio do texto", () => {
    expect(temNumeroCortado("Ana;5,51198E+12;ana@x.com")).toBe(true);
    expect(temNumeroCortado("Ana;5.511981918127E+12;ana@x.com")).toBe(false);
    expect(temNumeroCortado("Ana;(11) 98191-8127;ana2e3@x.com")).toBe(false);
  });
});

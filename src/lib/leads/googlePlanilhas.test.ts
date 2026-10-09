import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const buscarSeguro = vi.fn();
vi.mock("@/lib/imoveis/site/buscarSeguro", () => ({ buscarSeguro: (...a: unknown[]) => buscarSeguro(...a) }));

import { montarZip } from "../../../test/zipDeTeste";
import { parsearTabelaLeads, temCabecalhoDeContatos } from "./importacao";
import {
  abaQueBateComOCsv,
  baixarPlanilhaDoGoogle,
  linkDoGooglePlanilhas,
  urlDeExportacaoCsv,
} from "./googlePlanilhas";

describe("link do Google Planilhas", () => {
  it("reconhece o link e a aba", () => {
    const link = linkDoGooglePlanilhas(
      "  https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=123  ",
    );
    expect(link).toEqual({ id: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms", gid: "123" });
    expect(urlDeExportacaoCsv(link!)).toBe(
      "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=123",
    );
  });

  it("lista com um link no meio continua sendo lista", () => {
    expect(
      linkDoGooglePlanilhas("Ana 11999999999 https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74/edit"),
    ).toBeNull();
  });
});

describe("planilhas montadas no Google Planilhas", () => {
  it("acha o cabeçalho depois de um título, em CSV com vírgula", () => {
    const csv = "Leads de outubro,,\n,,\nNome,Telefone,E-mail\nAna Prado,(11) 99123-4567,ana@x.com\n";
    expect(temCabecalhoDeContatos(csv)).toBe(true);
    const [lead] = parsearTabelaLeads(csv);
    expect(lead.nome).toBe("Ana Prado");
    expect(lead.telefoneE164).toBe("5511991234567");
    expect(lead.email).toBe("ana@x.com");
  });

  it("título exato ganha: full_name antes de ad_name (leads da Meta)", () => {
    const csv = "id,ad_name,full_name,phone_number\nl:1,Anúncio Dom,Bruno Lima,p:+5511991234567\n";
    const [lead] = parsearTabelaLeads(csv);
    expect(lead.nome).toBe("Bruno Lima");
    expect(lead.telefoneE164).toBe("5511991234567");
  });
});

/*
 * O CSV do Google leva o que a planilha MOSTRA, e ela mostra o celular com 55
 * como "5.51198E+12". O .xlsx guarda o valor cru: com número cortado no CSV, a
 * mesma aba é relida de lá.
 */
describe("link do Google com telefone cortado", () => {
  const RESUMO = `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Total de leads</t></is></c><c r="B1"><v>2</v></c></row></sheetData></worksheet>`;
  const LEADS = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>full_name</t></is></c><c r="B1" t="inlineStr"><is><t>phone_number</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>Ana Prado</t></is></c><c r="B2"><v>5511981918127</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Lima, Bruno</t></is></c><c r="B3"><v>5511984444333</v></c></row>
  </sheetData></worksheet>`;
  const CSV = 'full_name,phone_number\nAna Prado,5.51198E+12\n"Lima, Bruno",5.51198E+12\n';

  function xlsx(abas: { nome: string; xml: string }[]) {
    return montarZip([
      {
        nome: "xl/workbook.xml",
        conteudo: `<workbook xmlns:r="r"><sheets>${abas.map((a, i) => `<sheet name="${a.nome}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
      },
      {
        nome: "xl/_rels/workbook.xml.rels",
        conteudo: `<Relationships>${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`,
      },
      ...abas.map((a, i) => ({ nome: `xl/worksheets/sheet${i + 1}.xml`, conteudo: a.xml })),
    ]);
  }

  it("relê a aba do link no .xlsx e traz o número inteiro", async () => {
    buscarSeguro.mockReset();
    buscarSeguro
      .mockResolvedValueOnce({ ok: true, bytes: Buffer.from(CSV), contentType: "text/csv", urlFinal: "" })
      .mockResolvedValueOnce({
        ok: true,
        bytes: xlsx([
          { nome: "Resumo", xml: RESUMO },
          { nome: "Leads", xml: LEADS },
        ]),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        urlFinal: "",
      });

    const baixada = await baixarPlanilhaDoGoogle({ id: "x".repeat(30), gid: "123" });

    expect(buscarSeguro.mock.calls[1][0]).toContain("export?format=xlsx");
    expect(baixada.ok && parsearTabelaLeads(baixada.texto).map((l) => [l.nome, l.telefoneE164])).toEqual([
      ["Ana Prado", "5511981918127"],
      ["Lima, Bruno", "5511984444333"],
    ]);
  });

  it("sem .xlsx, segue com o CSV (e a importação marca as linhas cortadas)", async () => {
    buscarSeguro.mockReset();
    buscarSeguro
      .mockResolvedValueOnce({ ok: true, bytes: Buffer.from(CSV), contentType: "text/csv", urlFinal: "" })
      .mockResolvedValueOnce({ ok: false, motivo: "rede", mensagem: "fora do ar" });

    expect(await baixarPlanilhaDoGoogle({ id: "x".repeat(30), gid: null })).toEqual({ ok: true, texto: CSV });
  });

  it("CSV sem número cortado não baixa o .xlsx", async () => {
    buscarSeguro.mockReset();
    const inteiro = "full_name,phone_number\nAna Prado,+5511981918127\n";
    buscarSeguro.mockResolvedValueOnce({ ok: true, bytes: Buffer.from(inteiro), contentType: "text/csv", urlFinal: "" });

    expect(await baixarPlanilhaDoGoogle({ id: "x".repeat(30), gid: null })).toEqual({ ok: true, texto: inteiro });
    expect(buscarSeguro).toHaveBeenCalledTimes(1);
  });

  it("aba escolhida pelo texto; empate ou nada parecido é nenhuma", () => {
    const csv = [["full_name", "phone_number"], ["Ana Prado", "5.51198E+12"], ["Lima, Bruno", "5.51198E+12"]];
    const leads = { nome: "Leads", linhas: [["full_name", "phone_number"], ["Ana Prado", "5511981918127"], ["Lima, Bruno", "5511984444333"]] };
    const resumo = { nome: "Resumo", linhas: [["Total de leads", "2"]] };

    expect(abaQueBateComOCsv([resumo, leads], csv)?.nome).toBe("Leads");
    expect(abaQueBateComOCsv([leads, { ...leads, nome: "Cópia" }], csv)).toBeNull();
    expect(abaQueBateComOCsv([resumo], csv)).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parsearTabelaLeads, temCabecalhoDeContatos } from "./importacao";
import { linkDoGooglePlanilhas, urlDeExportacaoCsv } from "./googlePlanilhas";

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

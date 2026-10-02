import { describe, expect, it } from "vitest";
import { dataDeEntrega } from "./dataDeEntrega";

describe("entrega prevista para a coluna date", () => {
  it("mês sozinho vira o dia 1º (o erro 22007 de produção)", () => {
    expect(dataDeEntrega("2027-10")).toBe("2027-10-01");
    expect(dataDeEntrega("7/2026")).toBe("2026-07-01");
    expect(dataDeEntrega("2028")).toBe("2028-01-01");
    expect(dataDeEntrega("2027-10-15")).toBe("2027-10-15");
  });
  it("o que não é data não é gravado", () => {
    expect(dataDeEntrega("breve")).toBeNull();
    expect(dataDeEntrega("2027-13")).toBeNull();
  });
});

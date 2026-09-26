import { describe, expect, it } from "vitest";
import { chaveDaUnidade, lerTabelaDeDisponibilidade } from "./tabelaDeDisponibilidade";

describe("tabela de disponibilidade da construtora", () => {
  it("lê planilha colada com situação escrita", () => {
    const r = lerTabelaDeDisponibilidade(
      "Unidade\tTipologia\tÁrea\tSituação\n101\t2 dorm\t55\tVendida\n102\t2 dorm\t55\tDisponível\n103\t3 dorm\t78\tReservada",
    );
    expect(r.linhas).toEqual([
      { identificacao: "101", status: "vendida" },
      { identificacao: "102", status: "disponivel" },
      { identificacao: "103", status: "reservada" },
    ]);
    expect(r.ignoradas).toBe(1);
  });

  it("linha só com preço é unidade à venda; sem situação nem preço é ignorada", () => {
    const r = lerTabelaDeDisponibilidade("Apto 201   2 dorm   R$ 480.000,00\nTotal de unidades   40");
    expect(r.linhas).toEqual([{ identificacao: "201", status: "disponivel" }]);
    expect(r.ignoradas).toBe(1);
  });

  it("aceita bloco na identificação e a mesma unidade escrita de outro jeito", () => {
    const r = lerTabelaDeDisponibilidade("A-101;vendido\nB 102;livre");
    expect(r.linhas.map((l) => l.identificacao)).toEqual(["A-101", "B 102"]);
    expect(chaveDaUnidade("A-101")).toBe(chaveDaUnidade("a 101"));
  });
});

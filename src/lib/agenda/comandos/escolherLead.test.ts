import { describe, expect, it } from "vitest";
import { escolherLeadsPorNome } from "./escolherLead";

const ANA_SOUZA = { id: "1", nome: "Ana Souza" };
const ANA_LIMA = { id: "2", nome: "Ana Lima" };
const JOAO = { id: "3", nome: "João Pereira" };
const ANA_MARIA = { id: "4", nome: "Ana Maria Souza" };

describe("escolherLeadsPorNome", () => {
  it("um só candidato casa: devolve ele", () => {
    expect(escolherLeadsPorNome("joao", [ANA_SOUZA, JOAO])).toEqual({ tipo: "um", lead: JOAO });
  });

  it("ignora acento e caixa", () => {
    expect(escolherLeadsPorNome("JOÃO", [JOAO])).toEqual({ tipo: "um", lead: JOAO });
    expect(escolherLeadsPorNome("ana souza", [{ id: "9", nome: "Ána Sóuza" }])).toEqual({
      tipo: "um",
      lead: { id: "9", nome: "Ána Sóuza" },
    });
  });

  it("vários casam: devolve as opções em ordem de nome", () => {
    expect(escolherLeadsPorNome("Ana", [ANA_SOUZA, JOAO, ANA_LIMA])).toEqual({
      tipo: "varios",
      opcoes: [ANA_LIMA, ANA_SOUZA],
    });
  });

  it("nome completo exato ganha de quem só casa por prefixo", () => {
    expect(escolherLeadsPorNome("Ana Souza", [ANA_MARIA, ANA_SOUZA])).toEqual({ tipo: "um", lead: ANA_SOUZA });
  });

  it("dois com o mesmo nome completo: pergunta entre eles", () => {
    const outra = { id: "5", nome: "ana souza" };
    expect(escolherLeadsPorNome("Ana Souza", [ANA_SOUZA, outra, ANA_MARIA])).toEqual({
      tipo: "varios",
      opcoes: [ANA_SOUZA, outra],
    });
  });

  it("cada palavra do nome precisa ser começo de alguma palavra do candidato", () => {
    expect(escolherLeadsPorNome("an sou", [ANA_SOUZA, ANA_LIMA])).toEqual({ tipo: "um", lead: ANA_SOUZA });
    expect(escolherLeadsPorNome("souza ana", [ANA_SOUZA, ANA_LIMA])).toEqual({ tipo: "um", lead: ANA_SOUZA });
    expect(escolherLeadsPorNome("Ana Costa", [ANA_SOUZA, ANA_LIMA])).toEqual({ tipo: "nenhum" });
  });

  it("meio de palavra não conta", () => {
    expect(escolherLeadsPorNome("ouza", [ANA_SOUZA])).toEqual({ tipo: "nenhum" });
  });

  it("mais de 4: as 4 primeiras por nome", () => {
    const anas = ["Ana E", "Ana B", "Ana D", "Ana A", "Ana C"].map((nome, i) => ({ id: String(i), nome }));
    const r = escolherLeadsPorNome("ana", anas);
    expect(r.tipo).toBe("varios");
    if (r.tipo !== "varios") return;
    expect(r.opcoes.map((o) => o.nome)).toEqual(["Ana A", "Ana B", "Ana C", "Ana D"]);
  });

  it("nada casa, nome vazio ou lista vazia: nenhum", () => {
    expect(escolherLeadsPorNome("Carlos", [ANA_SOUZA])).toEqual({ tipo: "nenhum" });
    expect(escolherLeadsPorNome("   ", [ANA_SOUZA])).toEqual({ tipo: "nenhum" });
    expect(escolherLeadsPorNome("Ana", [])).toEqual({ tipo: "nenhum" });
  });

  it("candidato sem nome não quebra", () => {
    expect(escolherLeadsPorNome("Ana", [{ id: "7", nome: "" }, ANA_SOUZA])).toEqual({ tipo: "um", lead: ANA_SOUZA });
  });
});

import { describe, expect, it } from "vitest";
import { perguntaDoLead } from "./perguntaDoLead";

describe("perguntaDoLead", () => {
  it("monta a pergunta com o que o corretor cadastrou", () => {
    const p = perguntaDoLead({
      nome: "Ana Paula",
      rendaMensal: 8000,
      orcamentoMax: 400000,
      dormitoriosMin: 2,
      regiaoInteresse: "Barueri",
    });
    expect(p).toContain("Ana Paula");
    expect(p).toMatch(/8\.000/);
    expect(p).toMatch(/400\.000/);
    expect(p).toContain("2+ dormitórios");
    expect(p).toContain("quer em Barueri");
    expect(p).toMatch(/serve, e fecha\?$/);
  });

  it("um dormitório não vira plural", () => {
    expect(perguntaDoLead({ dormitoriosMin: 1 })).toContain("1+ dormitório.");
  });

  it("faixa de orçamento vira intervalo; só um lado vira teto ou piso", () => {
    expect(perguntaDoLead({ orcamentoMin: 200000, orcamentoMax: 300000 })).toContain("entre");
    expect(perguntaDoLead({ orcamentoMax: 300000 })).toContain("até");
    expect(perguntaDoLead({ orcamentoMin: 200000 })).toContain("a partir de");
  });

  it("ficha vazia NÃO vira pergunta — o botão some", () => {
    /*
     * "O que serve para alguém?" gastaria uma chamada para receber "me conta
     * mais". Botão que leva a lugar nenhum é pior que a ausência dele.
     */
    expect(perguntaDoLead({})).toBeNull();
    expect(perguntaDoLead({ nome: "Ana" })).toBeNull();
    expect(perguntaDoLead({ rendaMensal: 0, orcamentoMax: null, regiaoInteresse: "  " })).toBeNull();
  });

  it("o NOME sozinho não sustenta a pergunta", () => {
    // Saber que ela se chama Ana não ajuda a escolher imóvel nenhum.
    expect(perguntaDoLead({ nome: "Ana" })).toBeNull();
    expect(perguntaDoLead({ nome: "Ana", regiaoInteresse: "Osasco" })).toContain("Osasco");
  });

  it("sem nome, a pergunta continua fazendo sentido", () => {
    const p = perguntaDoLead({ rendaMensal: 5000 });
    expect(p).toMatch(/^Cliente renda de/);
  });
});

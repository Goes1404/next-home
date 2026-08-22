import { describe, expect, it } from "vitest";
import { textoDeContingencia } from "./aiAgent";

const base = { nomeAssistente: "Sofia", nomeCorretor: "Bruna" };

describe("Texto de contingência para o cliente", () => {
  it("no primeiro contato, se apresenta", () => {
    const texto = textoDeContingencia({ ...base, temHistorico: false });
    expect(texto).toContain("Sofia");
    expect(texto).toContain("Bruna");
  });

  it("no meio da conversa, NÃO se apresenta de novo nem cumprimenta do zero", () => {
    // O texto antigo era sempre "Olá! Recebi sua mensagem sobre nossos
    // imóveis..." — disparado por um timeout na quinta mensagem, fazia o
    // atendimento parecer ter reiniciado e ignorava a pergunta do cliente.
    const texto = textoDeContingencia({ ...base, temHistorico: true });
    expect(texto).not.toMatch(/^Olá/);
    expect(texto).not.toContain("Sou a Sofia");
  });

  it("nunca finge ter respondido a pergunta — só promete retorno", () => {
    for (const temHistorico of [true, false]) {
      const texto = textoDeContingencia({ ...base, temHistorico });
      expect(texto.toLowerCase()).toMatch(/instante|instantes/);
    }
  });
});

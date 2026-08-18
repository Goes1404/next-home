import { describe, expect, it } from "vitest";
import { preencherTemplate } from "./mensagem";

const VARS = {
  nomeLead: "Maria",
  nomeCorretor: "João",
  telefoneCorretor: "5511999998888",
};

describe("preencherTemplate", () => {
  it("substitui as três variáveis", () => {
    const resultado = preencherTemplate(
      "Olá {{nome_lead}}, aqui é {{nome_corretor}}, meu contato é {{telefone_corretor}}.",
      VARS,
    );
    expect(resultado).toBe("Olá Maria, aqui é João, meu contato é 5511999998888.");
  });

  it("substitui a mesma variável repetida mais de uma vez", () => {
    const resultado = preencherTemplate("{{nome_lead}}, {{nome_lead}}!", VARS);
    expect(resultado).toBe("Maria, Maria!");
  });

  it("não quebra quando falta variável no texto", () => {
    const resultado = preencherTemplate("Mensagem fixa sem variável nenhuma.", VARS);
    expect(resultado).toBe("Mensagem fixa sem variável nenhuma.");
  });

  it("ignora chaves desconhecidas, sem tentar substituir", () => {
    const resultado = preencherTemplate("{{campo_invalido}} olá {{nome_lead}}", VARS);
    expect(resultado).toBe("{{campo_invalido}} olá Maria");
  });
});

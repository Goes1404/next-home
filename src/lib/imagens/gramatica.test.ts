import { describe, expect, it } from "vitest";
import { conferir, instrucaoDaGramatica, PISO_DE_PROMPT, SECOES } from "./gramatica";

describe("a gramática cobre as quatro seções da doc oficial", () => {
  it("tem cena, sujeito, detalhes e restrições", () => {
    expect(SECOES.map((s) => s.chave)).toEqual(["cena", "sujeito", "detalhes", "restricoes"]);
  });

  it("a instrução nomeia todas as seções, senão o tradutor não sabe o que preencher", () => {
    const texto = instrucaoDaGramatica().toLowerCase();
    for (const secao of SECOES) expect(texto).toContain(secao.rotulo.toLowerCase());
  });

  it("a instrução exige texto entre aspas e soletrado — foi 2 em 2 na F0", () => {
    const texto = instrucaoDaGramatica().toLowerCase();
    expect(texto).toContain("aspas");
    expect(texto).toContain("soletr");
  });
});

describe("conferir aponta o que ficou de fora", () => {
  it("um prompt completo não tem pendência", () => {
    const bom =
      "Fachada de edifício residencial alto vista da calçada, em leve contra-plongée com lente grande-angular. " +
      "Fim de tarde, luz quente e rasante, céu limpo. Concreto claro, vidro refletivo e paisagismo tropical no térreo. " +
      "Sem pessoas com rosto reconhecível e sem qualquer texto ou placa na cena.";
    expect(conferir(bom)).toEqual([]);
  });

  it("prompt sem luz nem hora do dia acusa detalhes", () => {
    const semLuz =
      "Fachada de edifício alto vista da calçada em contra-plongée, com varandas e uma torre ao fundo. " +
      "Sem texto na cena e sem pessoas com rosto reconhecível aparecendo.";
    expect(conferir(semLuz)).toContain("detalhes");
  });

  it("prompt sem negativa acusa restrições", () => {
    const semNegativa =
      "Fachada de edifício alto vista da calçada em contra-plongée, fim de tarde com luz quente, " +
      "concreto claro e vidro refletivo, com paisagismo tropical no térreo da torre.";
    expect(conferir(semNegativa)).toContain("restricoes");
  });

  it("uma palavra acusa tudo — é o caso `Torre.` que virou imagem paga em 09/09", () => {
    expect(conferir("Torre.").length).toBe(SECOES.length);
  });

  it("o piso existe e é maior que uma palavra solta", () => {
    expect(PISO_DE_PROMPT).toBeGreaterThan("Torre.".length);
  });
});

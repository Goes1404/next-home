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

  it("pedido fora de imóveis não é acusado de faltar sujeito nem restrição", () => {
    /*
     * As MARCAS de `sujeito` eram a lista `fachada|prédio|sala|piscina…` e
     * `restricoes` exigia uma negação. Um pedido legítimo de outro assunto
     * saía com duas dicas de erro — e este projeto já perdeu tempo CINCO
     * vezes com critério que reprova o comportamento certo.
     */
    const pedido =
      "Retrato fotográfico de um cachorro golden retriever vestido de Papai Noel, " +
      "sentado em um tapete, plano médio frontal, luz quente de fim de tarde " +
      "entrando pela janela, sombras suaves e textura de pelo bem definida.";
    expect(conferir(pedido)).toEqual([]);
  });

  it("nunca devolve sujeito nem restricoes — não são universais", () => {
    const semNegativa =
      "Fachada de edifício alto vista da calçada em contra-plongée, fim de tarde com luz quente, " +
      "concreto claro e vidro refletivo, com paisagismo tropical no térreo da torre.";
    for (const texto of ["", "x".repeat(200), semNegativa]) {
      expect(conferir(texto)).not.toContain("sujeito");
      expect(conferir(texto)).not.toContain("restricoes");
    }
  });

  it("uma palavra acusa as duas conferidas — é o caso `Torre.` de 09/09", () => {
    expect(conferir("Torre.").sort()).toEqual(["cena", "detalhes"]);
  });

  it("o piso existe e é maior que uma palavra solta", () => {
    expect(PISO_DE_PROMPT).toBeGreaterThan("Torre.".length);
  });
});

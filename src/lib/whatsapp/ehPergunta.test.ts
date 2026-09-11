import { describe, expect, it } from "vitest";
import { ehPergunta, forcaDaPergunta } from "./ehPergunta";

/**
 * A régua que decide se a IA responde ou avança o funil.
 *
 * A distinção forte/fraca não é preciosismo: a primeira versão devolvia um
 * booleano e roubou do funil uma fala que era RESPOSTA — "pode ser na
 * planta" tem `pode`, virou pergunta, e a qualificação travou no lugar. O
 * teste do trace cooperativo pegou na mesma execução.
 */
describe("forcaDaPergunta", () => {
  it("interrogativo e '?' são fortes — valem mesmo citando assunto do funil", () => {
    expect(forcaDaPergunta("qual o valor?")).toBe("forte");
    expect(forcaDaPergunta("aceita pet")).toBe("fraca");
    expect(forcaDaPergunta("fica onde o condomínio")).toBe("forte");
    expect(forcaDaPergunta("onde fica o condomínio")).toBe("forte");
  });

  /*
   * A ordem das palavras NÃO pode decidir se a pergunta é respondida — foi
   * ela que fez a IA ignorar um cliente em 10/09, quando o regex de endereço
   * conhecia "onde fica" e não "fica onde".
   */
  it("a ordem das palavras não muda nada", () => {
    expect(forcaDaPergunta("quantos quartos tem")).toBe("forte");
    expect(forcaDaPergunta("tem quantos quartos")).toBe("forte");
  });

  it("pedido é pergunta, mesmo sem interrogativo", () => {
    expect(forcaDaPergunta("me manda a planta")).toBe("fraca");
    expect(forcaDaPergunta("queria saber do financiamento")).toBe("fraca");
  });

  it("'pode ser X' é RESPOSTA, e por isso é fraca", () => {
    expect(forcaDaPergunta("pode ser na planta")).toBe("fraca");
    expect(forcaDaPergunta("pode ser sábado")).toBe("fraca");
  });

  it("afirmação não é pergunta nenhuma", () => {
    expect(forcaDaPergunta("bom dia")).toBe("nao");
    expect(forcaDaPergunta("2 dormitórios")).toBe("nao");
    expect(forcaDaPergunta("procuro em Alphaville")).toBe("nao");
    expect(ehPergunta("obrigado")).toBe(false);
  });

  it("acento e caixa não mudam a leitura", () => {
    expect(forcaDaPergunta("QUAL O PREÇO")).toBe("forte");
    expect(forcaDaPergunta("qual o preco")).toBe("forte");
  });
});

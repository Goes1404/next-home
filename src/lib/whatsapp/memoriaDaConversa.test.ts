import { describe, expect, it } from "vitest";
import { blocoDaMemoria, mesclarMemoria, TETO_DA_MEMORIA } from "./memoriaDaConversa";

/**
 * A memória da conversa — o que sobrevive à janela de 40 falas.
 *
 * Medido em 11/09/2026: nas conversas ativas, até 27 das 40 falas da janela
 * são do CORRETOR (o número é o WhatsApp pessoal dele). O usuário decidiu
 * manter isso sem teto; a memória é o que compensa.
 */

describe("mesclarMemoria — null não apaga", () => {
  it("sem memória anterior, a nova vale", () => {
    expect(mesclarMemoria({ texto: null, doCorretor: false }, "Procura 2 dorm em Barueri.")).toBe(
      "Procura 2 dorm em Barueri.",
    );
  });

  it("extração vazia NÃO apaga o que já se sabia", () => {
    expect(mesclarMemoria({ texto: "Procura 2 dorm.", doCorretor: false }, null)).toBe("Procura 2 dorm.");
    expect(mesclarMemoria({ texto: "Procura 2 dorm.", doCorretor: false }, "   ")).toBe("Procura 2 dorm.");
  });

  it("a extração nova SUBSTITUI a anterior — ela já recebeu a antiga para atualizar", () => {
    expect(
      mesclarMemoria({ texto: "Procura 2 dorm.", doCorretor: false }, "Procura 3 dorm em Alphaville."),
    ).toBe("Procura 3 dorm em Alphaville.");
  });
});

/**
 * O texto do corretor é o único que a IA não reescreve.
 *
 * Correção que a próxima mensagem desfaz parece botão quebrado — e é assim
 * que alguém para de corrigir. A mesma razão de `campos_do_corretor` existir
 * na ficha.
 */
describe("mesclarMemoria — o corretor vence", () => {
  it("preserva o texto dele e ACRESCENTA o que for novo", () => {
    const final = mesclarMemoria(
      { texto: "Cliente é irmão do síndico. Não falar de preço.", doCorretor: true },
      "Procura 3 dorm em Alphaville.",
    )!;
    expect(final).toContain("Cliente é irmão do síndico. Não falar de preço.");
    expect(final).toContain("Procura 3 dorm em Alphaville.");
    // O texto dele vem PRIMEIRO: é o que o modelo lê antes de tudo.
    expect(final.indexOf("síndico")).toBeLessThan(final.indexOf("Alphaville"));
  });

  it("não duplica o que ele já tinha escrito", () => {
    expect(mesclarMemoria({ texto: "Procura 3 dorm.", doCorretor: true }, "Procura 3 dorm.")).toBe(
      "Procura 3 dorm.",
    );
  });

  it("extração vazia deixa o texto dele intacto", () => {
    expect(mesclarMemoria({ texto: "Não ligar antes das 18h.", doCorretor: true }, null)).toBe(
      "Não ligar antes das 18h.",
    );
  });
});

describe("mesclarMemoria — o teto", () => {
  it("corta no teto e corta em FRONTEIRA DE FRASE", () => {
    const longa = "Frase de exemplo com algum tamanho. ".repeat(100);
    const final = mesclarMemoria({ texto: null, doCorretor: false }, longa)!;
    expect(final.length).toBeLessThanOrEqual(TETO_DA_MEMORIA);
    /*
     * Cortar no meio da frase produz memória que termina em "o cliente
     * prefere o" — e o modelo completa sozinho. É a família do acabamento
     * inventado, agora no contexto.
     */
    expect(final.endsWith(".")).toBe(true);
  });

  it("com o corretor no meio, o texto DELE é o que não se corta", () => {
    const dele = "Sobrinho do proprietário. Desconto já combinado com a diretoria.";
    const final = mesclarMemoria({ texto: dele, doCorretor: true }, "Detalhe. ".repeat(400))!;
    expect(final.length).toBeLessThanOrEqual(TETO_DA_MEMORIA);
    expect(final).toContain(dele);
  });
});

describe("blocoDaMemoria", () => {
  it("sem memória, não ocupa lugar nenhum no prompt", () => {
    expect(blocoDaMemoria(null)).toBe("");
    expect(blocoDaMemoria("  ")).toBe("");
  });

  it("com memória, ela vem rotulada como o que já se sabe", () => {
    const bloco = blocoDaMemoria("Procura 2 dorm.");
    expect(bloco).toContain("Procura 2 dorm.");
    expect(bloco).toContain("MEMÓRIA DA CONVERSA");
  });
});

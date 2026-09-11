import { describe, expect, it } from "vitest";
import { construirPromptSistema } from "./aiAgent";
import { blocoDaMemoria } from "./memoriaDaConversa";

/**
 * A memória entra no prompt ANTES de tudo — e a posição é o que se testa.
 *
 * A v32 pagou caro por isto: o bloco da jogada nasceu no slot onde os blocos
 * antigos moravam, na posição 27.697 de 35.751 caracteres, DEPOIS das 37
 * regras. "Primeiríssimo lugar" era falso, e enterrado ele competia
 * exatamente como os antigos. Só a sonda de prompt pegou — teste, tipo e
 * build passavam.
 */
const base = {
  nomeCorretor: "Cristal - Bruna",
  slugCorretor: "cristal-bruna",
  creciCorretor: "254161",
  telefoneCorretor: "5511999999999",
  nomeAssistente: "Lia",
  tomVoz: "consultivo_alto_padrao",
  historicoMensagens: [] as { remetente: "cliente" | "bot" | "corretor"; texto: string }[],
  catalogo: [],
};

describe("a memória no prompt", () => {
  const memoria = "Procura 2 dorm em Barueri, até 400 mil. Recusou o Terra Alta por causa do preço.";

  it("aparece quando existe", () => {
    const prompt = construirPromptSistema({ ...base, blocoMemoria: blocoDaMemoria(memoria) });
    expect(prompt).toContain("Recusou o Terra Alta");
  });

  it("vem ANTES da identidade e do bloco da jogada", () => {
    const prompt = construirPromptSistema({
      ...base,
      blocoMemoria: blocoDaMemoria(memoria),
      blocoJogada: "SUA ÚNICA TAREFA NESTA MENSAGEM: perguntar a região.",
    });
    const posMemoria = prompt.indexOf("MEMÓRIA DA CONVERSA");
    const posJogada = prompt.indexOf("SUA ÚNICA TAREFA");
    const posIdentidade = prompt.indexOf("Você é Lia");

    expect(posMemoria).toBeGreaterThanOrEqual(0);
    expect(posMemoria).toBeLessThan(posJogada);
    expect(posMemoria).toBeLessThan(posIdentidade);
    // E no comecinho mesmo, não "no topo da seção de blocos".
    expect(posMemoria).toBeLessThan(50);
  });

  it("sem memória, não gasta um caractere do prompt", () => {
    const semMemoria = construirPromptSistema({ ...base, blocoMemoria: blocoDaMemoria(null) });
    const comJogada = construirPromptSistema({ ...base });
    expect(semMemoria).toBe(comJogada);
  });
});

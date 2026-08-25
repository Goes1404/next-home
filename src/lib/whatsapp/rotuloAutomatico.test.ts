import { describe, expect, it } from "vitest";
import {
  assumiuCorrigindo,
  lerSinaisDoMundo,
  palpitarRotulo,
  precisaDeOlhoHumano,
  type FalaDaConversa,
} from "./rotuloAutomatico";

const cliente = (texto: string): FalaDaConversa => ({ remetente: "cliente", texto });
const bot = (texto: string, interacaoId = "i1"): FalaDaConversa => ({
  remetente: "bot",
  texto,
  interacaoId,
});
const corretor = (texto: string): FalaDaConversa => ({ remetente: "corretor", texto });

describe("assumiuCorrigindo — a ressalva que impede punir o sucesso", () => {
  it("desmentir o que a IA disse é correção", () => {
    expect(
      assumiuCorrigindo(
        "O Terra Alta tem 3 dormitórios e 2 vagas.",
        "Na verdade o Terra Alta é de 1 dormitório, me confundi aqui",
      ),
    ).toBe(true);
  });

  it("reescrever a mesma informação com outras palavras é correção", () => {
    expect(
      assumiuCorrigindo(
        "Temos unidades disponíveis no Vista AlphaGran, quer ver a planta?",
        "O Vista AlphaGran está com poucas unidades, te mando a planta agora",
      ),
    ).toBe(true);
  });

  it("assumir para FECHAR não é correção", () => {
    /*
     * A diferença que decide se o rótulo é 👎 ou nada. Errar aqui faz toda
     * conversa de sucesso virar nota negativa — e rótulo que pune o sucesso
     * é pior que rótulo nenhum.
     */
    expect(
      assumiuCorrigindo(
        "Que ótimo! Prefere manhã ou tarde no sábado?",
        "Oi Marcelo, aqui é a Bruna. Te ligo em 10 minutos para acertarmos tudo",
      ),
    ).toBe(false);
  });

  it("repetir quase literalmente é confirmação, não correção", () => {
    const igual = "Podemos ver no sábado de manhã, às 10h, no decorado.";
    expect(assumiuCorrigindo(igual, igual)).toBe(false);
  });
});

describe("lerSinaisDoMundo", () => {
  it("o corretor corrigindo vira 'ruim' com a correção anexada", () => {
    // O corretor já rotula — só não clica. E a mensagem dele não é só a
    // nota: é a resposta certa, candidata a exemplo.
    const leituras = lerSinaisDoMundo([
      cliente("quantos dormitórios tem o Terra Alta?"),
      bot("O Terra Alta tem 3 dormitórios."),
      corretor("Na verdade o Terra Alta é de 1 dormitório"),
    ]);

    expect(leituras).toHaveLength(1);
    expect(leituras[0].sinais).toContain("corretor_corrigiu");
    expect(leituras[0].palpite).toBe("ruim");
    expect(leituras[0].correcaoDoCorretor).toContain("1 dormitório");
  });

  it("o corretor entrando para fechar NÃO vira rótulo ruim", () => {
    const leituras = lerSinaisDoMundo([
      cliente("quero visitar sábado"),
      bot("Que ótimo! Prefere manhã ou tarde?"),
      corretor("Oi! Aqui é a Bruna, te ligo em 10 minutos para acertarmos"),
    ]);

    expect(leituras[0].sinais).toContain("corretor_assumiu_para_fechar");
    expect(leituras[0].palpite).toBeNull();
  });

  it("o cliente repetindo a pergunta é 'ruim'", () => {
    const leituras = lerSinaisDoMundo([
      cliente("quantos dormitórios tem?"),
      bot("É um empreendimento incrível em Barueri!"),
      cliente("mas quantos dormitórios tem?"),
    ]);

    expect(leituras[0].sinais).toContain("cliente_repetiu_a_pergunta");
    expect(leituras[0].palpite).toBe("ruim");
  });

  it("o cliente pedindo gente é 'ruim'", () => {
    const leituras = lerSinaisDoMundo([
      cliente("oi"),
      bot("Olá! Como posso ajudar?"),
      cliente("quero falar com uma pessoa"),
    ]);
    expect(leituras[0].palpite).toBe("ruim");
  });

  it("conversa seguindo normalmente não vira rótulo nenhum", () => {
    /*
     * `null` é o desfecho mais comum, e tem de ser. Palpitar "bom" para
     * toda resposta sem problema encheria o dataset de exemplos sem
     * informação, e o sistema aprenderia que o normal é ótimo.
     */
    const leituras = lerSinaisDoMundo([
      cliente("oi, procuro apê em Barueri"),
      bot("Que bom! Prefere pronto para morar ou na planta?"),
      cliente("pronto para morar"),
    ]);
    expect(leituras[0].sinais).toEqual(["cliente_seguiu"]);
    expect(leituras[0].palpite).toBeNull();
  });

  it("a última resposta da conversa não é acusada de nada", () => {
    // Pode ter sido enviada há trinta segundos. Quem sabe se houve silêncio
    // é o relógio, e ele não está nesta função.
    const leituras = lerSinaisDoMundo([cliente("oi"), bot("Olá! Em qual região você procura?")]);
    expect(leituras[0].sinais).toEqual([]);
    expect(leituras[0].palpite).toBeNull();
  });

  it("lê todas as respostas da conversa, não só a última", () => {
    /*
     * O defeito estrutural que a 0040 corrigiu no banco: só dava para
     * avaliar a última resposta, e a falha no MEIO da conversa — o rótulo
     * que mais ensina — era impossível de gravar.
     */
    const leituras = lerSinaisDoMundo([
      cliente("quantos quartos?"),
      bot("Fica em Barueri!", "primeira"),
      cliente("quantos quartos?"),
      bot("São 3 dormitórios.", "segunda"),
      cliente("perfeito, quero visitar"),
    ]);

    expect(leituras.map((l) => l.interacaoId)).toEqual(["primeira", "segunda"]);
    expect(leituras[0].palpite).toBe("ruim");
    expect(leituras[1].palpite).toBeNull();
  });
});

describe("palpitarRotulo", () => {
  it("sem sinal, sem palpite", () => {
    expect(palpitarRotulo([])).toBeNull();
    expect(palpitarRotulo(["cliente_seguiu"])).toBeNull();
  });
});

describe("precisaDeOlhoHumano", () => {
  it("o humano entra só onde mundo e juiz discordam", () => {
    expect(precisaDeOlhoHumano("ruim", "bom")).toBe(true);
    expect(precisaDeOlhoHumano("bom", "ruim")).toBe(true);
  });

  it("concordância não gasta o tempo de ninguém", () => {
    // Pedir que alguém leia duzentas conversas para confirmar o óbvio é o
    // jeito mais certo de não colher rótulo nenhum — o 👍/👎 existe desde a
    // 0040 e colheu ZERO.
    expect(precisaDeOlhoHumano("ruim", "ruim")).toBe(false);
    expect(precisaDeOlhoHumano("bom", "bom")).toBe(false);
  });

  it("sem opinião de um dos dois, não há desacordo para arbitrar", () => {
    expect(precisaDeOlhoHumano(null, "ruim")).toBe(false);
    expect(precisaDeOlhoHumano("ruim", null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { distribuirVariantes, ENVIOS_MINIMOS, resultadoAB } from "./testeAB";

describe("distribuirVariantes", () => {
  it("divide ao meio — moeda por item sairia torta numa fila curta", () => {
    const v = distribuirVariantes(20);
    expect(v.filter((x) => x === "A")).toHaveLength(10);
    expect(v.filter((x) => x === "B")).toHaveLength(10);
  });

  it("alterna, para nenhuma versão ficar presa ao começo da fila", () => {
    // A ordem da fila é a ordem do disparo, e o horário também influencia a
    // resposta: dar os primeiros 10 para a A misturaria os dois efeitos.
    expect(distribuirVariantes(4, "A")).toEqual(["A", "B", "A", "B"]);
    expect(distribuirVariantes(4, "B")).toEqual(["B", "A", "B", "A"]);
  });

  it("com quantidade ímpar, a diferença é de no máximo um", () => {
    const v = distribuirVariantes(7);
    const a = v.filter((x) => x === "A").length;
    expect(Math.abs(a - (7 - a))).toBe(1);
  });
});

describe("resultadoAB", () => {
  const cheio = (respostasA: number, respostasB: number) =>
    resultadoAB({
      a: { enviados: ENVIOS_MINIMOS, respostas: respostasA },
      b: { enviados: ENVIOS_MINIMOS, respostas: respostasB },
    });

  it("não fala em vencedor antes do piso de amostra", () => {
    /*
     * "A: 8% e B: 0%" com 12 envios de cada lado não significa nada — e é
     * o número que faria alguém reescrever a mensagem que funcionava.
     */
    const r = resultadoAB({ a: { enviados: 12, respostas: 1 }, b: { enviados: 12, respostas: 0 } });
    expect(r.temVencedor).toBe(false);
    expect(r.leitura).toMatch(/faltam 18 envio/);
  });

  it("mostra o andamento mesmo sem base — o corretor precisa ver a fila andando", () => {
    const r = resultadoAB({ a: { enviados: 10, respostas: 1 }, b: { enviados: 8, respostas: 0 } });
    expect(r.a.taxa).toBe(10);
    expect(r.b.taxa).toBe(0);
  });

  it("com amostra, aponta a versão melhor — e pede repetição, não declara prova", () => {
    const r = cheio(6, 1);
    expect(r.temVencedor).toBe(true);
    expect(r.leitura).toContain("versão A");
    expect(r.leitura).toMatch(/Repita numa próxima campanha/);
    // "Sinal", nunca "vencedor provado": taxa de campanha vive perto de 1%
    // e 30 de cada lado continua sendo amostra pequena.
    expect(r.leitura).toMatch(/^Sinal/);
  });

  it("empate é empate, não desempate no arredondamento", () => {
    const r = cheio(3, 3);
    expect(r.temVencedor).toBe(false);
    expect(r.leitura).toMatch(/Empate/);
  });

  it("taxa é null quando ninguém recebeu — não zero", () => {
    // Zero significaria "mandamos e ninguém respondeu"; null é "não mandamos".
    const r = resultadoAB({ a: { enviados: 0, respostas: 0 }, b: { enviados: 0, respostas: 0 } });
    expect(r.a.taxa).toBeNull();
  });
});

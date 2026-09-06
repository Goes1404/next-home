import { describe, expect, it } from "vitest";
import {
  blocoNaoRepitaHorario,
  horariosJaOferecidos,
  jaFoiOferecido,
  semOsJaOferecidos,
} from "./ofertasDeVisita";
import type { Fala } from "./rajada";

const bot = (texto: string): Fala => ({ remetente: "bot", texto });
const cliente = (texto: string): Fala => ({ remetente: "cliente", texto });

describe("horariosJaOferecidos", () => {
  it("pega o caso real que travou a conversa da v26", () => {
    // insiste-no-desconto: os mesmos dois horários, três vezes.
    const r = horariosJaOferecidos([
      bot("Posso te mostrar sábado às 10h ou às 11h?"),
      cliente("mas qual é o valor?"),
      bot("Posso te mostrar sábado às 10h ou às 11h, qual prefere?"),
    ]);

    expect(r.assinaturas).toContain("sabado-10");
    expect(r.assinaturas).toContain("sabado-11");
    expect(r.frases.length).toBe(2);
  });

  it("conta as DUAS horas de uma oferta com dia único", () => {
    // Sem o produto cartesiano, a segunda escaparia e voltaria na resposta
    // seguinte — que é exatamente o loop.
    const r = horariosJaOferecidos([bot("Consigo terça às 15h ou às 17h")]);
    expect(r.assinaturas.sort()).toEqual(["terca-15", "terca-17"]);
  });

  it("aceita oferta por período, sem hora exata", () => {
    const r = horariosJaOferecidos([bot("Que tal sábado de manhã?")]);
    expect(r.assinaturas).toContain("sabado-manha");
  });

  it("ignora frase que fala de horário sem ser convite", () => {
    // "o decorado abre de manhã" é informação. Marcá-la proibiria a Sofia
    // de oferecer a manhã que nunca ofereceu.
    const r = horariosJaOferecidos([
      bot("O decorado abre de manhã e fecha às 18h."),
      bot("A obra começou em março."),
    ]);
    expect(r.frases).toEqual([]);
  });

  it("só olha o que o BOT falou", () => {
    // Horário que o CLIENTE propôs não é oferta a evitar — é o contrário.
    const r = horariosJaOferecidos([
      cliente("posso sábado às 10h"),
      { remetente: "corretor", texto: "posso domingo às 9h" },
    ]);
    expect(r.frases).toEqual([]);
  });

  it("não repete a mesma frase na lista", () => {
    const r = horariosJaOferecidos([
      bot("Posso sábado às 10h?"),
      bot("Posso sábado às 10h?"),
    ]);
    expect(r.frases.length).toBe(1);
  });
});

describe("jaFoiOferecido", () => {
  const { assinaturas } = horariosJaOferecidos([bot("Posso te mostrar sábado às 10h ou às 11h?")]);

  it("reconhece o mesmo horário escrito como a agenda o escreve", () => {
    // A agenda real rotula "sábado, 06/09 às 10h".
    expect(jaFoiOferecido("sábado, 06/09 às 10h", assinaturas)).toBe(true);
    expect(jaFoiOferecido("sábado, 06/09 às 11h", assinaturas)).toBe(true);
  });

  it("libera o horário que ainda não saiu", () => {
    expect(jaFoiOferecido("sábado, 06/09 às 15h", assinaturas)).toBe(false);
    expect(jaFoiOferecido("terça, 09/09 às 10h", assinaturas)).toBe(false);
  });
});

describe("blocoNaoRepitaHorario", () => {
  it("fica calado na primeira oferta — repetir uma vez pode ser mensagem não vista", () => {
    expect(blocoNaoRepitaHorario(horariosJaOferecidos([bot("Posso sábado às 10h?")]))).toBeUndefined();
  });

  it("aparece a partir da segunda e nomeia o que já saiu", () => {
    const bloco = blocoNaoRepitaHorario(
      horariosJaOferecidos([
        bot("Posso te mostrar sábado às 10h?"),
        bot("Consigo sábado às 11h, prefere?"),
      ]),
    );

    expect(bloco).toBeDefined();
    expect(bloco).toContain("sábado às 10h");
    expect(bloco).toContain("sábado às 11h");
    // A saída alternativa importa tanto quanto a proibição: bloco que só
    // proíbe empurra o modelo para o silêncio.
    expect(bloco).toMatch(/qual dia da semana/i);
  });
});

describe("semOsJaOferecidos", () => {
  const { assinaturas } = horariosJaOferecidos([bot("Posso te mostrar sábado às 10h ou às 11h?")]);
  const agenda = [
    { rotulo: "sábado, 06/09 às 10h" },
    { rotulo: "sábado, 06/09 às 11h" },
    { rotulo: "terça, 09/09 às 14h" },
  ];

  it("tira da lista o que já saiu — o que o modelo não vê, ele não oferece", () => {
    expect(semOsJaOferecidos(agenda, assinaturas).map((h) => h.rotulo)).toEqual([
      "terça, 09/09 às 14h",
    ]);
  });

  it("devolve a lista inteira quando nada foi oferecido ainda", () => {
    expect(semOsJaOferecidos(agenda, [])).toEqual(agenda);
  });

  it("nunca devolve vazio: zero opção trocaria repetição por silêncio", () => {
    const todos = horariosJaOferecidos([
      bot("Posso sábado às 10h?"),
      bot("Posso sábado às 11h?"),
      bot("Posso terça às 14h?"),
    ]);
    expect(semOsJaOferecidos(agenda, todos.assinaturas)).toEqual(agenda);
  });
});

/**
 * Regressão contra a conversa REAL que motivou o módulo — as falas da Sofia
 * na persona `insiste-no-desconto` do eval de conversa da v26, copiadas de
 * `eval/resultados/transcricoes/2026.08-v26-insiste-no-desconto.txt`.
 *
 * Vale mais que um caso inventado: prova que a régua reage ao texto que o
 * modelo de verdade produziu, com as variações que ele de verdade usou.
 */
describe("a conversa que motivou o módulo (v26, insiste-no-desconto)", () => {
  const falasDaSofia = [
    "Sei que o valor decide, mas varia por unidade e condição de pagamento. Posso te mostrar as opções e condições pessoalmente. Qual região você prefere para eu indicar algo que cabe no seu perfil?",
    "Me conta um pouco mais do que você procura para eu te ajudar melhor.",
    "Sei que o valor é o ponto principal, mas ele varia conforme unidade e condições. Posso te mostrar tudo com detalhes no stand. Que região você prefere?",
    "O valor exato quem passa é a construtora, e varia por unidade e condições. A visita é o momento certo para detalhar preço, fluxo e condições. Posso te mostrar sábado às 10h ou às 11h, qual prefere?",
    "O valor exato quem passa é a construtora e muda por unidade e condição de pagamento. A visita é onde trato tudo isso com você. Posso te mostrar sábado às 10h ou às 11h?",
  ];

  it("os turnos 1 a 3 não contam como oferta de horário", () => {
    // "Posso te mostrar as opções pessoalmente" e "no stand" são convites
    // sem hora. Marcá-los proibiria a Sofia de oferecer um horário que ela
    // nunca ofereceu.
    const r = horariosJaOferecidos(falasDaSofia.slice(0, 3).map(bot));
    expect(r.frases).toEqual([]);
    expect(blocoNaoRepitaHorario(r)).toBeUndefined();
  });

  it("na PRIMEIRA oferta com hora ainda fica calado", () => {
    const r = horariosJaOferecidos(falasDaSofia.slice(0, 4).map(bot));
    expect(r.assinaturas).toContain("sabado-10");
    expect(blocoNaoRepitaHorario(r)).toBeUndefined();
  });

  it("na SEGUNDA — que na conversa real foi seguida de uma terceira — ele dispara", () => {
    const bloco = blocoNaoRepitaHorario(horariosJaOferecidos(falasDaSofia.map(bot)));

    expect(bloco).toBeDefined();
    expect(bloco).toContain("sábado às 10h ou às 11h");
  });
});

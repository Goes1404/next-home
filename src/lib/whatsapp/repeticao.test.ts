import { describe, expect, it } from "vitest";
import { ehRepeticaoDoBot, normalizarParaRepeticao, textoNoLugarDaRepeticao } from "./repeticao";

/**
 * Os casos abaixo são TRECHOS REAIS de produção (conversa …8216, 22/08),
 * não exemplos inventados — é o loop que a corretora anotou no próprio
 * chat: "está em um looping mandando as fotos, a conversa não está
 * desenrolando para o pré entendimento do cliente".
 */
const FICHA_TERRA_ALTA =
  "O Terra Alta tem 1 dormitório, 52m² e 2 vagas. --- Quer ver as fotos ou agendar uma visita?";
const PLANTA_MANACA =
  "Aqui está a planta do Manacá Barueri de novo! 😊 Quer ver mais detalhes ou agendar uma visita?";

describe("Repetição literal do bot", () => {
  it("pega a mesma ficha devolvida contra outra pergunta do cliente", () => {
    const historico = [
      { remetente: "cliente", texto: "Tem outra opção ?" },
      { remetente: "bot", texto: FICHA_TERRA_ALTA },
      { remetente: "cliente", texto: "Tem 3 dormitórios?" },
    ];
    expect(ehRepeticaoDoBot(FICHA_TERRA_ALTA, historico)).toBe(true);
  });

  it("pega a mesma frase com e sem nota de anexo grudada", () => {
    const comAnexo = `${FICHA_TERRA_ALTA}\n\n📎 Terra Alta: https://exemplo.supabase.co/foto-1.jpg`;
    const historico = [{ remetente: "bot", texto: comAnexo }];
    expect(ehRepeticaoDoBot(FICHA_TERRA_ALTA, historico)).toBe(true);
  });

  it("pega o loop da planta, que apareceu três vezes seguidas", () => {
    const historico = [
      { remetente: "bot", texto: PLANTA_MANACA },
      { remetente: "cliente", texto: "[cliente enviou um documento: \"Lead.zip\"]" },
    ];
    expect(ehRepeticaoDoBot(PLANTA_MANACA, historico)).toBe(true);
  });

  it("ignora diferença de acento, caixa e pontuação", () => {
    const historico = [{ remetente: "bot", texto: "O Terra Alta fica no Jardim Tupanci, Barueri." }];
    expect(ehRepeticaoDoBot("o terra alta fica no jardim tupanci barueri", historico)).toBe(true);
  });

  it("não acusa resposta diferente sobre o mesmo imóvel", () => {
    const historico = [{ remetente: "bot", texto: FICHA_TERRA_ALTA }];
    expect(
      ehRepeticaoDoBot(
        "O Terra Alta fica no Jardim Tupanci, em Barueri. Prefere conhecer sábado de manhã?",
        historico,
      ),
    ).toBe(false);
  });

  /*
   * Repetir "Claro!" ou "Perfeito, anotado" é fala humana normal. Só vira
   * defeito quando é um bloco inteiro de conteúdo voltando igual.
   */
  it("não acusa confirmação curta repetida", () => {
    const historico = [{ remetente: "bot", texto: "Perfeito, anotado!" }];
    expect(ehRepeticaoDoBot("Perfeito, anotado!", historico)).toBe(false);
  });

  it("não compara com o que o CLIENTE disse", () => {
    const historico = [{ remetente: "cliente", texto: FICHA_TERRA_ALTA }];
    expect(ehRepeticaoDoBot(FICHA_TERRA_ALTA, historico)).toBe(false);
  });

  it("esquece o que ficou para trás na conversa", () => {
    const historico = [
      { remetente: "bot", texto: FICHA_TERRA_ALTA },
      ...Array.from({ length: 6 }, (_, i) => ({
        remetente: "bot",
        texto: `Mensagem intermediária número ${i} com conteúdo suficiente para contar.`,
      })),
    ];
    expect(ehRepeticaoDoBot(FICHA_TERRA_ALTA, historico)).toBe(false);
  });

  it("sem histórico, nada é repetição", () => {
    expect(ehRepeticaoDoBot(FICHA_TERRA_ALTA, [])).toBe(false);
    expect(ehRepeticaoDoBot(FICHA_TERRA_ALTA, undefined)).toBe(false);
  });

  it("normaliza tirando anexo, url e separador de balões", () => {
    expect(normalizarParaRepeticao("Oi! --- Tudo bem?\n\n📎 Foto: https://x.co/a.jpg")).toBe(
      "oi tudo bem",
    );
  });
});

describe("Texto que entra no lugar da repetição", () => {
  /*
   * Repetir acontece justamente quando o modelo não tem o que acrescentar.
   * Inventar fato aqui trocaria um defeito visível (loop) por um invisível
   * (informação falsa) — por isso a saída devolve o turno ao cliente sem
   * afirmar nada sobre imóvel.
   */
  it("não afirma nada sobre imóvel, preço ou disponibilidade", () => {
    for (let i = 0; i < 6; i++) {
      const historico = Array.from({ length: i }, () => ({ remetente: "bot", texto: "x" }));
      const texto = textoNoLugarDaRepeticao(historico);
      expect(texto).not.toMatch(/R\$|\d+\s*m²|dormit[óo]rio.*\d|dispon[íi]vel/i);
      expect(texto.length).toBeGreaterThan(10);
    }
  });

  it("varia, para não virar ela mesma um segundo loop", () => {
    const uma = textoNoLugarDaRepeticao([{ remetente: "bot", texto: "a" }]);
    const outra = textoNoLugarDaRepeticao([
      { remetente: "bot", texto: "a" },
      { remetente: "bot", texto: "b" },
    ]);
    expect(uma).not.toBe(outra);
  });
});

describe("Repetição x conteúdo novo", () => {
  /*
   * Trocar o loop por perda de informação seria pior: o loop o cliente vê,
   * a informação faltando ninguém vê.
   */
  it("deixa passar a resposta que repete a frase E acrescenta bastante coisa nova", () => {
    const anterior = "O Terra Alta fica no Jardim Tupanci, em Barueri, pertinho do centro.";
    const nova =
      `${anterior} Tem 1 dormitório, 52m² e 2 vagas, e a entrega está prevista para o ` +
      "ano que vem. Prefere conhecer o decorado no sábado de manhã ou à tarde?";
    expect(ehRepeticaoDoBot(nova, [{ remetente: "bot", texto: anterior }])).toBe(false);
  });

  it("ainda pega a repetição com uma variação mínima no fim", () => {
    const anterior =
      "O Terra Alta tem 1 dormitório, 52m² e 2 vagas. Quer ver as fotos ou agendar uma visita?";
    expect(ehRepeticaoDoBot(`${anterior} 😊`, [{ remetente: "bot", texto: anterior }])).toBe(true);
  });
});

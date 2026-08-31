import { describe, expect, it } from "vitest";
import { aproveitarSoONovo, ehRepeticaoDoBot, normalizarParaRepeticao, textoNoLugarDaRepeticao } from "./repeticao";
import { limparSeparadoresOrfaos } from "./semValores";

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

  /*
   * A intenção deste teste não mudou: a saída não pode virar ela mesma um
   * loop. O MECANISMO mudou, e por medição — ele variava conforme a
   * CONTAGEM de mensagens do bot (`total % 3`), e com três saídas o resto
   * do módulo faz o índice voltar. O eval da v26 flagrou: a mesma frase nos
   * turnos 7 e 10, palavra por palavra. Agora a variação depende do que foi
   * DITO, que é a única coisa que o cliente percebe.
   */
  it("varia quando a saída anterior já foi dita — não pela contagem", () => {
    const uma = textoNoLugarDaRepeticao([{ remetente: "bot", texto: "a" }]);
    const outra = textoNoLugarDaRepeticao([
      { remetente: "bot", texto: "a" },
      { remetente: "bot", texto: uma },
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

describe("Separador de balão órfão", () => {
  /*
   * Caso real do eval da v12: o cliente disse "meu teto é 600 mil", o
   * modelo repetiu o número, `removerValores` cortou a frase — e a
   * resposta chegou começando com "--- ". Traço solto no primeiro balão
   * não parece pessoa digitando, parece software quebrado.
   */
  it("tira o separador que sobra no começo depois de cortar a frase do preço", () => {
    expect(
      limparSeparadoresOrfaos("--- Quer que eu veja outras opções em Alphaville?"),
    ).toBe("Quer que eu veja outras opções em Alphaville?");
  });

  it("colapsa separador duplicado quando a frase do meio some", () => {
    expect(limparSeparadoresOrfaos("Oi! --- --- Quer conhecer?")).toBe("Oi! --- Quer conhecer?");
  });

  it("tira separador solto no fim", () => {
    expect(limparSeparadoresOrfaos("Quer conhecer? ---")).toBe("Quer conhecer?");
  });

  it("não mexe em texto bem formado", () => {
    const bom = "Oi! Tudo bem? --- Me conta, você conhece a região? --- Prefere manhã ou tarde?";
    expect(limparSeparadoresOrfaos(bom)).toBe(bom);
  });
});

describe("quase idêntica também é loop (Onda 2)", () => {
  // Pares REAIS da fábrica de 25/08: a Sofia repetiu a ideia trocando a
  // moldura, e a guarda literal deixava passar.
  const historico = [
    {
      remetente: "bot",
      texto:
        "O More Aldeia tem um conceito moderno e funcional, focado em conforto e praticidade para o dia a dia. Quer que eu te envie a apresentação digital para você ver tudo com calma?",
    },
  ];

  it("mesma ideia de casaco trocado é bloqueada", () => {
    expect(
      ehRepeticaoDoBot(
        "O More Aldeia tem um conceito moderno e funcional, com lazer completo. Quer que eu te envie a apresentação digital para você avaliar com calma?",
        historico,
      ),
    ).toBe(true);
  });

  it("resposta com conteúdo NOVO de verdade passa", () => {
    // Medido: máximo 0,10 de semelhança — margem larga até o limiar 0,45.
    expect(
      ehRepeticaoDoBot(
        "O More Aldeia fica a cinco minutos da estação Antônio João e tem entrada parcelada direto com a construtora. Prefere visitar sábado de manhã ou à tarde?",
        historico,
      ),
    ).toBe(false);
  });

  it("paráfrase genuína passa DE PROPÓSITO (0,28-0,38 medido) — é papel da regra 27", () => {
    expect(
      ehRepeticaoDoBot(
        "Entendo sua dúvida, o More Aldeia é moderno, com lazer completo e foco em conforto. Posso enviar a apresentação digital para você avaliar com calma?",
        historico,
      ),
    ).toBe(false);
  });

  it("paráfrase distante fica abaixo do limiar, de propósito", () => {
    expect(
      ehRepeticaoDoBot(
        "Esse projeto foi pensado para quem valoriza praticidade no dia a dia, com áreas de lazer completas no condomínio.",
        historico,
      ),
    ).toBe(false);
  });
});

describe("aproveitarSoONovo — cortar o eco, manter o inédito", () => {
  const historico = [
    {
      remetente: "bot",
      texto:
        "O More Aldeia tem um conceito moderno e funcional, focado em conforto. Quer que eu te envie a apresentação digital para você ver tudo com calma?",
    },
  ];

  it("frase ecoada sai; a inédita fica com a pontuação dela", () => {
    const r = aproveitarSoONovo(
      "Quer que eu te envie a apresentação digital para você avaliar com calma? O More Aldeia fica a cinco minutos da estação e tem entrada parcelada.",
      historico,
    );
    expect(r).toBe("O More Aldeia fica a cinco minutos da estação e tem entrada parcelada.");
  });

  it("resposta toda ecoada vira vazio — e o chamador cai no enlatado", () => {
    const r = aproveitarSoONovo(
      "Quer que eu te envie a apresentação digital para ver tudo com calma?",
      historico,
    );
    expect(r.length).toBeLessThan(40);
  });

  it("sem histórico do bot, nada é cortado", () => {
    const texto = "Quer que eu te envie a apresentação digital para você ver tudo com calma?";
    expect(aproveitarSoONovo(texto, [])).toBe(texto);
  });
});

describe("a saída nunca repete a saída — a guarda não pode virar o loop", () => {
  const bot = (texto: string) => ({ remetente: "bot", texto });

  /*
   * O defeito medido no eval da v26 (`insiste-no-desconto`): a escolha era
   * `totalDeMensagensDoBot % 3`, o índice voltava, e a persona recebeu
   * "Me conta um pouco mais do que você procura" nos turnos 7 e 10 — palavra
   * por palavra. Quatro dos doze turnos daquela conversa eram desta lista.
   */
  it("não devolve uma saída que já foi dita nesta conversa", () => {
    const primeira = textoNoLugarDaRepeticao([]);
    const segunda = textoNoLugarDaRepeticao([bot(primeira)]);
    const terceira = textoNoLugarDaRepeticao([bot(primeira), bot(segunda)]);

    expect(new Set([primeira, segunda, terceira]).size).toBe(3);
  });

  it("reconhece a saída já dita mesmo dentro de uma mensagem maior", () => {
    const primeira = textoNoLugarDaRepeticao([]);
    const depois = textoNoLugarDaRepeticao([
      bot(`Claro! ${primeira} Fico no aguardo.`),
    ]);
    expect(depois).not.toBe(primeira);
  });

  /*
   * Esgotadas as saídas, uma quarta pergunta de qualificação seria o loop
   * de novo. O que ainda não foi tentado é devolver a ESCOLHA ao cliente.
   */
  it("quando todas foram usadas, muda de gênero em vez de insistir", () => {
    const usadas = [
      textoNoLugarDaRepeticao([]),
      "Para eu te indicar certo: quantos dormitórios você precisa?",
      "Prefere conhecer pessoalmente? Consigo te mostrar essa semana.",
      "Me conta um pouco mais do que você procura para eu te ajudar melhor.",
    ].map(bot);

    const final = textoNoLugarDaRepeticao(usadas);
    expect(final).toContain("Me diz o que te ajudaria mais agora");
    expect(usadas.map((u) => u.texto)).not.toContain(final);
  });

  it("nunca devolve texto vazio — mensagem em branco é pior que repetição", () => {
    const tudo = [
      "Me conta um pouco mais do que você procura para eu te ajudar melhor.",
      "Para eu te indicar certo: quantos dormitórios você precisa?",
      "Prefere conhecer pessoalmente? Consigo te mostrar essa semana.",
      "Me diz o que te ajudaria mais agora: ver as fotos, o link com tudo do empreendimento, ou marcar de conversar pessoalmente?",
    ].map(bot);

    expect(textoNoLugarDaRepeticao(tudo).length).toBeGreaterThan(0);
  });
});

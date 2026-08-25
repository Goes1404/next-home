import { describe, expect, it } from "vitest";
import {
  medirConversa,
  perguntasDe,
  semelhanca,
  type TurnoRegistrado,
} from "./metricasConversa";

const turno = (
  cliente: string | string[],
  bot: string,
  extra: Partial<TurnoRegistrado> = {},
): TurnoRegistrado => ({
  cliente: Array.isArray(cliente) ? cliente : [cliente],
  bot,
  ...extra,
});

/** Uma conversa saudável, para servir de controle nos testes de reprovação. */
const CONVERSA_BOA: TurnoRegistrado[] = [
  turno("oi, vi um anúncio de vocês", "Oi! Que bom que chamou. Você procura em qual região?"),
  turno("Barueri", "Perfeito, temos boas opções por lá. Prefere pronto para morar ou na planta?"),
  turno("pronto", "Ótimo. Quantos dormitórios você precisa?"),
  turno("3", "Anotei. Qual a renda mensal da família, para eu ver o que o banco financia?"),
  turno(
    "uns 15 mil",
    "Show. Tenho o Vista AlphaGran, 3 dorm com suíte. Quer conhecer o decorado no sábado?",
    { sugeriuVisita: true },
  ),
];

describe("semelhança entre frases", () => {
  it("a mesma pergunta reescrita quase igual conta como igual", () => {
    expect(semelhanca("em qual região você procura?", "em qual região procura?"))
      .toBeGreaterThanOrEqual(0.6);
  });

  it("PARÁFRASE não é detectada — e isso é decisão, não descuido", () => {
    /*
     * "Qual sua renda mensal?" e "Quanto vocês recebem por mês?" são a mesma
     * pergunta e ficam abaixo do limiar. O erro é assimétrico de propósito:
     * deixar passar custa uma medida; acusar repetição que não houve manda
     * alguém consertar um comportamento correto — que é como este projeto já
     * perdeu tempo quatro vezes.
     */
    expect(semelhanca("qual a sua renda mensal?", "quanto vocês recebem por mês?"))
      .toBeLessThan(0.6);
  });

  it("perguntas parecidas na forma e diferentes no assunto NÃO se confundem", () => {
    // O motivo de usar palavras úteis em vez de distância de edição: estas
    // duas têm quase todas as letras em comum e perguntam coisas distintas.
    expect(semelhanca("em que região você procura?", "em que prazo você precisa?"))
      .toBeLessThan(0.6);
  });
});

describe("perguntasDe", () => {
  it("pega só o que termina em interrogação", () => {
    const p = perguntasDe("Tenho sim. Quer ver a planta? Mando agora.");
    expect(p).toEqual(["Quer ver a planta?"]);
  });

  it("frase sem conteúdo não vira pergunta", () => {
    expect(perguntasDe("?")).toEqual([]);
  });
});

describe("oferta de visita", () => {
  it("acha o turno em que a visita foi oferecida", () => {
    expect(medirConversa(CONVERSA_BOA).turnoDaOfertaDeVisita).toBe(5);
  });

  it("reconhece o convite SEM a palavra visita", () => {
    /*
     * O critério antigo do eval exigia a palavra "visita" e reprovava
     * "podemos ver durante a semana, prefere manhã ou tarde?" — que é o
     * padrão exato de quem converte. Terceira vez que um critério deste
     * projeto reprovou o comportamento certo.
     */
    const m = medirConversa([
      turno("não posso sábado", "Tranquilo, podemos ver durante a semana então. Prefere manhã ou tarde?"),
    ]);
    expect(m.turnoDaOfertaDeVisita).toBe(1);
  });

  it("conversa que nunca convida reprova", () => {
    const m = medirConversa([
      turno("oi", "Olá! Como posso ajudar?"),
      turno("procuro apê", "Certo, me conte mais."),
    ]);
    expect(m.turnoDaOfertaDeVisita).toBeNull();
    expect(m.reprovacoes).toContain("nunca ofereceu visita");
  });

  it("convite tardio reprova mesmo existindo", () => {
    const tarde = Array.from({ length: 9 }, (_, i) =>
      i < 8
        ? turno(`pergunta ${i}`, `resposta número ${i} sobre um assunto qualquer`)
        : turno("ok", "Quer conhecer o decorado?", { sugeriuVisita: true }),
    );
    expect(medirConversa(tarde).reprovacoes.some((r) => r.includes("turno 9"))).toBe(true);
  });
});

describe("mídia repetida", () => {
  it("mesma URL duas vezes reprova", () => {
    // O loop de fotos visto em produção: ela reenviava as mesmas imagens a
    // cada duas ou três mensagens e a conversa parava de andar.
    const m = medirConversa([
      turno("manda foto", "Claro!", { anexos: ["https://x/a.jpg"] }),
      turno("mais uma", "Aqui!", { anexos: ["https://x/a.jpg"] }),
    ]);
    expect(m.midiasRepetidas).toEqual(["https://x/a.jpg"]);
  });

  it("fotos diferentes não reprovam", () => {
    const m = medirConversa([
      turno("manda foto", "Claro!", { anexos: ["https://x/a.jpg"] }),
      turno("mais uma", "Aqui!", { anexos: ["https://x/b.jpg"] }),
    ]);
    expect(m.midiasRepetidas).toEqual([]);
  });
});

describe("repetição", () => {
  it("a IA reperguntando o que já perguntou reprova", () => {
    const m = medirConversa([
      turno("oi", "Em qual região você procura?"),
      turno("Barueri", "Legal! Em qual região você procura?"),
    ]);
    expect(m.perguntasRepetidasPelaIa).toHaveLength(1);
  });

  it("o CLIENTE repetindo a pergunta é o sinal mais forte", () => {
    /*
     * Não há regra que decida se uma resposta "respondeu" — mas se o
     * cliente refaz a mesma pergunta depois, ela não respondeu. Quem julga
     * é o comportamento dele, não uma rubrica.
     */
    const m = medirConversa([
      turno("quantos dormitórios tem o Terra Alta?", "É um empreendimento incrível em Barueri!"),
      turno("mas quantos dormitórios tem?", "Fica pertinho da escola."),
    ]);
    expect(m.perguntasReaparecidas).toHaveLength(1);
    expect(m.reprovacoes.some((r) => r.includes("não respondeu"))).toBe(true);
  });

  it("resposta quase idêntica a uma anterior reprova", () => {
    const igual = "Temos ótimas opções em Barueri, quer que eu te mostre algumas fotos agora?";
    const m = medirConversa([turno("oi", igual), turno("e aí", igual)]);
    expect(m.respostasRepetidas).toBe(1);
  });

  it("a conversa boa não dispara nenhuma repetição", () => {
    const m = medirConversa(CONVERSA_BOA);
    expect(m.perguntasRepetidasPelaIa).toEqual([]);
    expect(m.perguntasReaparecidas).toEqual([]);
    expect(m.respostasRepetidas).toBe(0);
  });
});

describe("a conversa andou", () => {
  it("assunto novo a cada turno não acumula sequência parada", () => {
    expect(medirConversa(CONVERSA_BOA).maiorSequenciaSemNovidade).toBeLessThanOrEqual(1);
  });

  it("girar em torno do mesmo assunto reprova", () => {
    const parada = Array.from({ length: 6 }, (_, i) =>
      turno(`tá bom ${i}`, `Que ótimo! Fico feliz que tenha gostado, número ${i}.`),
    );
    const m = medirConversa(parada);
    expect(m.maiorSequenciaSemNovidade).toBeGreaterThan(3);
    expect(m.reprovacoes.some((r) => r.includes("sem assunto novo"))).toBe(true);
  });

  it("registra os assuntos de qualificação cobertos", () => {
    const m = medirConversa(CONVERSA_BOA);
    expect(m.assuntosCobertos).toEqual(
      expect.arrayContaining(["regiao", "estagio", "tipologia", "renda", "visita"]),
    );
  });
});

describe("voz constante", () => {
  it("dois modelos na mesma conversa reprovam", () => {
    // Guarda de regressão: o motor é um só desde 24/08/2026. Se alguém
    // reintroduzir cascata, é aqui que aparece.
    const m = medirConversa([
      turno("oi", "Olá!", { modelo: "gpt-4.1-mini" }),
      turno("tudo bem?", "Tudo ótimo!", { modelo: "gemini-3.5-flash" }),
    ]);
    expect(m.reprovacoes.some((r) => r.includes("a voz mudou"))).toBe(true);
  });

  it("um modelo só passa", () => {
    const m = medirConversa([
      turno("oi", "Olá!", { modelo: "gpt-4.1-mini" }),
      turno("tudo bem?", "Tudo ótimo! Em qual região você procura?", { modelo: "gpt-4.1-mini" }),
    ]);
    expect(m.modelos).toEqual(["gpt-4.1-mini"]);
    expect(m.reprovacoes.some((r) => r.includes("a voz mudou"))).toBe(false);
  });
});

describe("tamanho", () => {
  it("resposta gigante reprova", () => {
    const m = medirConversa([turno("oi", "a".repeat(600))]);
    expect(m.maiorMensagem).toBe(600);
    expect(m.reprovacoes.some((r) => r.includes("600 caracteres"))).toBe(true);
  });
});

describe("conversa vazia", () => {
  it("não quebra", () => {
    const m = medirConversa([]);
    expect(m.turnos).toBe(0);
    expect(m.mediaDeCaracteres).toBe(0);
  });
});

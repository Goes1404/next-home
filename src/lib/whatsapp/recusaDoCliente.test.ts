import { describe, expect, it } from "vitest";
import { detectarRecusa } from "./recusaDoCliente";

/**
 * O cliente disse que NÃO quer.
 *
 * Até 11/09/2026 o planner não enxergava isso: "não tenho interesse" era
 * fala não classificada, e fala não classificada cai na pergunta de funil.
 * Medido em produção — 01/09, 13:25: a cliente escreveu "No momento não
 * tenho interesse. Obrigada" e recebeu "Me conta, em qual região de Barueri
 * você procura?". Noutra conversa, "E eu não quero ir" foi respondido com
 * "Quer conhecer o decorado?" — exatamente o que ele acabara de recusar.
 *
 * O erro aqui é ASSIMÉTRICO, e é isso que desenha o detector: não achar uma
 * recusa custa uma mensagem inconveniente; achar uma recusa que não houve
 * ENCERRA um atendimento em andamento e silencia a IA, e quem reabre é o
 * corretor — que pode não perceber por dias.
 */

describe("detectarRecusa", () => {
  it("reconhece desinteresse dito de frente", () => {
    expect(detectarRecusa("No momento não tenho interesse. Obrigada")?.familia).toBe("desinteresse");
    expect(detectarRecusa("não quero, obrigado")?.familia).toBe("desinteresse");
    expect(detectarRecusa("não é pra mim")?.familia).toBe("desinteresse");
    expect(detectarRecusa("desisti")?.familia).toBe("desinteresse");
  });

  it("separa quem JÁ RESOLVEU — não é desinteresse, é fim de jornada", () => {
    expect(detectarRecusa("já comprei outro")?.familia).toBe("ja_resolvido");
    expect(detectarRecusa("já aluguei, valeu")?.familia).toBe("ja_resolvido");
    expect(detectarRecusa("fechei com outra imobiliária")?.familia).toBe("ja_resolvido");
  });

  it("pedido de parada é a família mais forte", () => {
    expect(detectarRecusa("me tira da lista")?.familia).toBe("parada");
    expect(detectarRecusa("para de mandar mensagem")?.familia).toBe("parada");
    expect(detectarRecusa("número errado")?.familia).toBe("parada");
    expect(detectarRecusa("não era eu que pedi")?.familia).toBe("parada");
  });

  /*
   * Os falsos positivos que derrubariam conversa BOA. Cada um destes é um
   * atendimento em andamento, e tratá-lo como recusa o encerraria — o erro
   * mais caro que este detector pode cometer.
   */
  it("não confunde recusa de UMA coisa com recusa do atendimento", () => {
    expect(detectarRecusa("não quero apartamento na planta, só pronto")).toBeNull();
    expect(detectarRecusa("não quero gastar mais que 400 mil")).toBeNull();
    expect(detectarRecusa("não tenho interesse em Alphaville, prefiro Barueri")).toBeNull();
    expect(detectarRecusa("não posso sábado, pode ser domingo?")).toBeNull();
    expect(detectarRecusa("não quero esse imóvel, tem outro?")).toBeNull();
  });

  it("saída suave NÃO é recusa — ela já tem jogada própria", () => {
    expect(detectarRecusa("vou pensar e te falo")).toBeNull();
    expect(detectarRecusa("vou ver com minha esposa")).toBeNull();
    expect(detectarRecusa("depois eu te falo")).toBeNull();
  });

  /*
   * O pedido de parada NÃO se desarma por complemento. "Para de mandar
   * mensagem sobre Alphaville" continua sendo um pedido de parada — quem
   * pede para parar não está escolhendo bairro.
   */
  it("o pedido de parada ignora o complemento", () => {
    expect(detectarRecusa("para de mandar mensagem sobre Alphaville")?.familia).toBe("parada");
    expect(detectarRecusa("me tira da lista de Barueri")?.familia).toBe("parada");
  });

  it("a fala vazia e o marcador de mensagem não gravada não decidem nada", () => {
    expect(detectarRecusa("")).toBeNull();
    expect(detectarRecusa("   ")).toBeNull();
    expect(detectarRecusa("[mensagem não gravada — conversa sem atendimento liberado]")).toBeNull();
  });

  it("acento e caixa não mudam a leitura", () => {
    expect(detectarRecusa("NÃO TENHO INTERESSE")?.familia).toBe("desinteresse");
    expect(detectarRecusa("nao tenho interesse")?.familia).toBe("desinteresse");
  });

  it("devolve o trecho que decidiu, para o prompt citar o que ele disse", () => {
    expect(detectarRecusa("olha, no momento não tenho interesse")?.trecho).toContain("interesse");
  });
});

/**
 * O "não" seco, e por que ele precisa de contexto.
 *
 * Achado pelo trace na PRIMEIRA execução, e é o turno que mais importa: ela
 * acolhe o "não tenho interesse", pergunta o motivo, ele responde "não,
 * obrigada" — e ela convidava para visita. Nenhum padrão casava, porque
 * sozinha essa fala não é recusa: respondendo a "pronto ou na planta?", ela
 * é só uma resposta. O que a torna recusa é o que veio antes.
 */
describe("o não seco só conta depois de uma recusa", () => {
  const depois = { jaRecusouAntes: true };

  it("sem contexto, um não seco é só uma resposta", () => {
    expect(detectarRecusa("não")).toBeNull();
    expect(detectarRecusa("não, obrigada")).toBeNull();
    expect(detectarRecusa("obrigada")).toBeNull();
  });

  it("depois de ele já ter recusado, é a confirmação", () => {
    expect(detectarRecusa("não", depois)?.familia).toBe("desinteresse");
    expect(detectarRecusa("não, obrigada", depois)?.familia).toBe("desinteresse");
    expect(detectarRecusa("já falei que não", depois)?.familia).toBe("desinteresse");
    expect(detectarRecusa("nada disso", depois)?.familia).toBe("desinteresse");
  });

  /*
   * E mesmo COM o contexto, fala com conteúdo continua sendo conversa: quem
   * responde o motivo está conversando, e às vezes é aí que a venda volta.
   */
  it("resposta COM conteúdo não é confirmação de recusa", () => {
    expect(detectarRecusa("foi o preço mesmo", depois)).toBeNull();
    expect(detectarRecusa("não, é que eu queria em Alphaville", depois)).toBeNull();
    expect(detectarRecusa("na verdade me manda o de 2 dorm", depois)).toBeNull();
  });
});

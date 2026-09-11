import { describe, expect, it } from "vitest";
import { blocoDaJogada, estadoDaConversa, planejarJogada, type EstadoDaConversa } from "./jogada";
import type { Empreendimento } from "@/lib/types";
import type { Fala } from "./rajada";

const bot = (texto: string): Fala => ({ remetente: "bot", texto });
const cliente = (texto: string): Fala => ({ remetente: "cliente", texto });

const IMOVEL = {
  slug: "terra-alta",
  nome: "Terra Alta Barueri",
  status: "em_construcao",
  cidade: "Barueri",
  bairro: "Jardim Tupanci",
  precoAPartir: 470000,
  lazer: [],
  tipologias: [
    { nome: "2", areaPrivativa: 63, dormitorios: 2, suites: 1, banheiros: 2, vagas: 1, preco: null, plantaUrl: null, unidadesDisponiveis: null },
  ],
} as unknown as Empreendimento;

function estado(over: Partial<EstadoDaConversa> = {}): EstadoDaConversa {
  return {
    respondidos: new Set(),
    perguntadosNaUltima: new Set(),
    perguntadosAlgumaVez: new Set(),
    convidouVisita: false,
    horariosOferecidos: 0,
    pedidoEmAberto: null,
    perguntaRepetida: null,
    falasDoCliente: 1,
    capacidadePendente: false,
    aceitouHorario: false,
    oQueEleDisse: "",
    vezesPerguntado: new Map(),
    pediuHorario: false,
    objetouPreco: false,
    pediuAlternativa: false,
    saidaSuave: false,
    objecoesSeguidas: 0,
    alternativa: null,
    nomeDoFoco: null,
    visitaConfirmada: false,
    perguntaSemDado: null,
    agendamento: { dia: null, hora: null, pediuVisita: false },
    recusa: null,
    recusasAnteriores: 0,
    falaAtualRespondeFunil: false,
    horasDesdeAUltimaFala: 0,
    ...over,
  };
}

describe("planejarJogada — a ordem de prioridade", () => {
  it("responder vem antes de perguntar: dado pedido ganha de tudo", () => {
    /*
     * Causa nº 1 da taxonomia: "não respondeu a pergunta" em 10 de 16
     * conversas. Se ele pediu um dado que temos, nada passa na frente.
     */
    const j = planejarJogada(
      estado({
        pedidoEmAberto: { tipo: "preco", resposta: "a partir de R$ 470.000", imovel: "Terra Alta" },
        respondidos: new Set(),
      }),
    );
    expect(j.tipo).toBe("responder_dado");
  });

  it("pergunta repetida sem dado → resposta honesta, não mais um desvio", () => {
    // Na SEGUNDA vez. Da terceira em diante a jogada muda (ver o bloco de
    // insistência abaixo) — este teste codificava vezes=3 e afirmava o
    // comportamento que a sonda da v32 mostrou ser o loop.
    const j = planejarJogada(
      estado({ perguntaRepetida: { pergunta: "tem churrasqueira?", vezes: 2, sobreDinheiro: false } }),
    );
    expect(j.tipo).toBe("responder_honesto");
  });

  it("segue a ordem do funil e pula o que o cliente já respondeu", () => {
    expect(planejarJogada(estado())).toEqual({ tipo: "perguntar", assunto: "regiao" });
    expect(planejarJogada(estado({ respondidos: new Set(["regiao"]), falasDoCliente: 1 }))).toEqual({
      tipo: "perguntar",
      assunto: "estagio",
    });
  });

  it("não insiste na pergunta que já fez DUAS vezes", () => {
    /*
     * É o que três versões de prompt não conseguiram: "não repita" era uma
     * súplica no texto. Aqui é comparação de conjuntos — com a nuance de
     * que UMA repergunta é permitida (o cliente pode ter respondido outra
     * coisa); na segunda, o assunto sai do caminho.
     */
    const j = planejarJogada(
      estado({
        perguntadosNaUltima: new Set(["regiao"]),
        vezesPerguntado: new Map([["regiao", 2]]),
        falasDoCliente: 1,
      }),
    );
    expect(j).not.toEqual({ tipo: "perguntar", assunto: "regiao" });
    expect(j).toEqual({ tipo: "perguntar", assunto: "estagio" });
  });

  it("capacidade só entra quando o funil chegou lá", () => {
    // Renda antes de região e tipologia é a pergunta que mais espanta cliente.
    const cedo = planejarJogada(
      estado({ respondidos: new Set(["regiao", "estagio", "tipologia"]), capacidadePendente: false, convidouVisita: true, falasDoCliente: 3 }),
    );
    expect(cedo.tipo).not.toBe("perguntar");

    const naHora = planejarJogada(
      estado({ respondidos: new Set(["regiao", "estagio", "tipologia"]), capacidadePendente: true, convidouVisita: true, falasDoCliente: 4 }),
    );
    expect(naHora).toEqual({ tipo: "perguntar", assunto: "capacidade" });
  });

  it("convida CEDO — assim que sabe a região, antes de o funil acabar", () => {
    // A corretora que converte convida na 5ª–8ª mensagem, junto com a
    // apresentação — não como prêmio no fim da qualificação.
    const j = planejarJogada(estado({ respondidos: new Set(["regiao"]), falasDoCliente: 2 }));
    expect(j.tipo).toBe("convidar_visita");
  });

  it("propõe horário só com o funil completo, e nunca depois de dois recusados", () => {
    const completo = new Set(["regiao", "estagio", "tipologia", "capacidade"] as const);
    expect(
      planejarJogada(estado({ respondidos: completo, convidouVisita: true, horariosOferecidos: 0, falasDoCliente: 5 })),
    ).toEqual({ tipo: "propor_horario", jaOfereceu: 0 });

    // Dois horários recusados: insistir num terceiro é o loop com outra roupa.
    expect(
      planejarJogada(estado({ respondidos: completo, convidouVisita: true, horariosOferecidos: 2, falasDoCliente: 6 })),
    ).toEqual({ tipo: "devolver_escolha" });
  });
});

describe("estadoDaConversa — lê o histórico", () => {
  it("sabe o que a IA perguntou na última mensagem e o que o cliente já disse", () => {
    const e = estadoDaConversa({
      historico: [
        cliente("oi, vi o anúncio"),
        bot("Que bom! Em qual região de Barueri você procura?"),
        cliente("Alphaville, 2 quartos"),
      ],
      mensagemAtual: "pode ser na planta",
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });

    expect(e.perguntadosNaUltima.has("regiao")).toBe(true);
    expect(e.respondidos.has("regiao")).toBe(true);
    expect(e.respondidos.has("tipologia")).toBe(true);
    expect(e.respondidos.has("estagio")).toBe(true);
  });

  it("o dossiê conta como respondido mesmo sem a palavra na fala", () => {
    const e = estadoDaConversa({
      historico: [],
      mensagemAtual: "oi",
      dossie: { rendaMensal: 9000, regiaoInteresse: "Alphaville", dormitoriosMin: null, orcamentoMin: null, orcamentoMax: null },
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });
    expect(e.respondidos.has("regiao")).toBe(true);
    expect(e.respondidos.has("capacidade")).toBe(true);
  });

  it("detecta o pedido de dado com o imóvel em foco", () => {
    const e = estadoDaConversa({
      historico: [cliente("gostei do terra alta")],
      mensagemAtual: "qual o valor?",
      imovelEmFoco: IMOVEL,
      catalogo: [IMOVEL],
    });
    expect(e.pedidoEmAberto?.tipo).toBe("preco");
    expect(planejarJogada(e).tipo).toBe("responder_dado");
  });
});

describe("blocoDaJogada", () => {
  it("é UMA tarefa, nomeada, no topo", () => {
    const b = blocoDaJogada({ tipo: "perguntar", assunto: "regiao" }, { nomeDoFoco: null });
    expect(b).toMatch(/^SUA ÚNICA TAREFA/);
    expect(b).toContain("região");
    expect(b).toMatch(/uma pergunta por mensagem/i);
  });

  it("no dado pedido, entrega a FRASE pronta — dado solto o modelo interpreta", () => {
    const b = blocoDaJogada(
      { tipo: "responder_dado", dado: { tipo: "preco", resposta: "a partir de R$ 470.000", imovel: "Terra Alta" } },
      { nomeDoFoco: "Terra Alta" },
    );
    expect(b).toContain('"O Terra Alta a partir de R$ 470.000."');
  });

  it("horário já recusado pede OUTROS, nunca os mesmos", () => {
    const b = blocoDaJogada({ tipo: "propor_horario", jaOfereceu: 1 }, { nomeDoFoco: null });
    expect(b).toMatch(/OUTROS, nunca os mesmos/);
  });
});

describe("insistência: a jogada MUDA na terceira vez", () => {
  const repetida = (vezes: number) => ({ pergunta: "qual o valor exato?", vezes, sobreDinheiro: true });

  it("na segunda, responde com honestidade", () => {
    expect(planejarJogada(estado({ perguntaRepetida: repetida(2) })).tipo).toBe("responder_honesto");
  });

  it("na terceira, propõe horário — a pergunta de preço é convite para a visita", () => {
    /*
     * Flagrado pela sonda da v32: o guardrail bloqueou três vezes a mesma
     * frase honesta nos turnos 4, 5 e 7. Responder de novo é o loop com
     * outra roupa; quem já ouviu a resposta quer o próximo passo.
     */
    expect(planejarJogada(estado({ perguntaRepetida: repetida(3), horariosOferecidos: 0 }))).toEqual({
      tipo: "propor_horario",
      jaOfereceu: 0,
    });
  });

  it("com dois horários já recusados, devolve a escolha em vez de insistir", () => {
    expect(planejarJogada(estado({ perguntaRepetida: repetida(4), horariosOferecidos: 2 })).tipo).toBe(
      "devolver_escolha",
    );
  });

  it("dado pedido continua ganhando: se temos o dado, entregamos, não importa quantas vezes", () => {
    const j = planejarJogada(
      estado({
        perguntaRepetida: repetida(5),
        pedidoEmAberto: { tipo: "preco", resposta: "a partir de R$ 470.000", imovel: "Terra Alta" },
      }),
    );
    expect(j.tipo).toBe("responder_dado");
  });
});

describe("dado já entregue não é pedido em aberto", () => {
  it("não repete o piso que a IA já disse", () => {
    /*
     * Sonda da v32, turno 11: "mas e o valor exato?" casava no regex de
     * preço e ela repetia "começa em R$ 249.000" do turno 1. Dado repetido
     * é o loop com roupa de resposta — e bloqueava a regra da terceira
     * insistência, que vem depois.
     */
    const e = estadoDaConversa({
      historico: [
        cliente("qual o valor?"),
        // O piso do catálogo do TESTE é 470.000 (IMOVEL); 249.000 é o do
        // fixture do eval — a primeira versão deste teste copiou o número
        // errado e acusou o código por um erro do próprio fixture.
        bot("O mais em conta do nosso catálogo começa em R$ 470.000. Em qual região você procura?"),
        cliente("mas qual o valor exato?"),
        bot("O valor exato depende do andar, e isso fechamos na visita."),
      ],
      // A MESMA pergunta, como o persona real faz. "mas e o valor exato
      // mesmo?" tem semelhança 0,50 com a anterior — abaixo do limiar de
      // 0,6, que existe de propósito: paráfrase não é acusada como
      // repetição. O erro assimétrico é deixar passar, não acusar demais.
      mensagemAtual: "qual o valor exato?",
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });

    expect(e.pedidoEmAberto).toBeNull();
    // Com o dado fora do caminho, a insistência (3ª vez) muda a jogada.
    expect(e.perguntaRepetida?.vezes).toBeGreaterThanOrEqual(3);
    expect(planejarJogada(e).tipo).toBe("propor_horario");
  });

  it("dado ainda NÃO dito continua sendo entregue", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Oi! Em qual região você procura?")],
      mensagemAtual: "quanto custa?",
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });
    expect(e.pedidoEmAberto?.tipo).toBe("preco");
    expect(planejarJogada(e).tipo).toBe("responder_dado");
  });
});

describe("a porta do horário conta TURNOS de oferta, não frases distintas", () => {
  it("duas ofertas com o mesmo texto contam duas — e a terceira vira devolver_escolha", () => {
    /*
     * Trace sem API da v32: turnos 4 a 8 todos `propor_horario` com
     * "já ofereceu 1" congelado, porque o detector deduplica sentenças
     * iguais. Confiar na variação de redação do executor para escapar de
     * um loop é a fragilidade que o planner existe para remover.
     */
    const oferta = "Posso te mostrar sábado às 10h ou terça às 15h?";
    const e = estadoDaConversa({
      historico: [
        cliente("qual o valor exato?"),
        bot("O mais em conta começa em R$ 470.000. Quer conhecer?"),
        cliente("qual o valor exato?"),
        bot("O valor exato depende do andar — isso o corretor fecha na visita."),
        cliente("qual o valor exato?"),
        bot(oferta),
        cliente("qual o valor exato?"),
        bot(oferta),
      ],
      mensagemAtual: "qual o valor exato?",
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });

    expect(e.horariosOferecidos).toBe(2);
    expect(planejarJogada(e).tipo).toBe("devolver_escolha");
  });
});

describe("os três achados do trace cooperativo", () => {
  it("'na planta' é ESTÁGIO, não tipologia — a pergunta de dormitórios continua devida", () => {
    const e = estadoDaConversa({
      historico: [cliente("procuro em Alphaville"), bot("Quer conhecer o decorado?")],
      mensagemAtual: "pode ser na planta",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.respondidos.has("estagio")).toBe(true);
    expect(e.respondidos.has("tipologia")).toBe(false);
    expect(planejarJogada(e)).toEqual({ tipo: "perguntar", assunto: "tipologia" });
  });

  it("a pergunta de FAIXA do próprio bot conta como capacidade — não se repete", () => {
    const e = estadoDaConversa({
      historico: [
        cliente("procuro em Alphaville, 2 dormitórios, na planta"),
        bot("Qual faixa de valor você tem em mente?"),
      ],
      mensagemAtual: "sim, quero conhecer",
      dossie: null, imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.perguntadosNaUltima.has("capacidade")).toBe(true);
    expect(planejarJogada(e)).not.toEqual({ tipo: "perguntar", assunto: "capacidade" });
  });

  it("aceitou o horário → CONFIRMAR, nunca propor outro", () => {
    /*
     * O momento da conversão. No trace, "sábado de manhã pode ser" recebia
     * `propor_horario` — o bloco mandaria propor OUTRO horário no instante
     * em que a pessoa aceitou o primeiro.
     */
    const e = estadoDaConversa({
      historico: [cliente("2 dorm em Alphaville"), bot("Posso te mostrar sábado às 10h ou terça às 15h?")],
      mensagemAtual: "sábado às 10h pode ser",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.aceitouHorario).toBe(true);
    expect(planejarJogada(e).tipo).toBe("confirmar_visita");
  });

  it("aceite ganha até de dado pedido — confirmar não espera", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Posso te mostrar sábado às 10h?")],
      mensagemAtual: "fechado, sábado às 10h. quanto custa mesmo?",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(planejarJogada(e).tipo).toBe("confirmar_visita");
  });

  it("'não pode' NÃO é aceite — a negação vence", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Posso te mostrar sábado às 10h?")],
      mensagemAtual: "sábado não pode, outro dia",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.aceitouHorario).toBe(false);
  });

  it("'pode ser' sem oferta anterior não é aceite de horário", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Em qual região você procura?")],
      mensagemAtual: "pode ser Alphaville",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.aceitouHorario).toBe(false);
  });
});

describe("repergunta e pedido de horário", () => {
  it("o assunto fechado CONTINUA fechado turnos depois", () => {
    /*
     * A primeira versão da regra olhava só a ÚLTIMA fala do bot, então o
     * assunto fechado no turno 4 era esquecido no 5 e voltava no 7. Medido
     * na v33 (`quer-tudo-pelo-zap`): "pronto ou na planta?" nos turnos 4, 7
     * e 9, com o cliente respondendo entre eles. Este teste mede o EFEITO
     * (segue fechado), não o mecanismo — teste que codifica o mecanismo
     * protege o defeito, como já aconteceu com o anti-repetição.
     */
    const historico = [
      cliente("me manda as infos por aqui"),
      bot("Você prefere imóvel pronto para morar ou na planta?"),
      cliente("me fala a metragem"), // responde sem usar as palavras do regex
      bot("São 38,81m² com 2 dormitórios."),
      cliente("tem foto"),
      bot("Te mandei as fotos aqui embaixo."),
    ];

    const depois = estadoDaConversa({
      historico, mensagemAtual: "quero ver mais detalhes", imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(depois.respondidos.has("estagio")).toBe(true);
    expect(planejarJogada(depois)).not.toEqual({ tipo: "perguntar", assunto: "estagio" });
  });

  it("desconversou sem perguntar → o assunto FECHA; só uma pergunta dele o mantém aberto", () => {
    /*
     * Regra da casa: "se ele desconversar em qualquer uma, siga a conversa —
     * perder o lead por insistência é pior que ficar sem o dado". A v32
     * reperguntava e regrediu (IA repetiu 6,5 → 14). Agora qualquer resposta
     * sem "?" fecha a pergunta do turno anterior; a repergunta só cabe
     * quando ele perguntou outra coisa em vez de responder.
     */
    const historico = [
      cliente("Alphaville, 2 dormitórios, na planta"),
      bot("Quer conhecer o decorado? Qual faixa de valor você tem em mente?"),
    ];

    const desconversou = estadoDaConversa({
      historico, mensagemAtual: "sim, quero conhecer!", imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(desconversou.respondidos.has("capacidade")).toBe(true);
    expect(planejarJogada(desconversou)).not.toEqual({ tipo: "perguntar", assunto: "capacidade" });

    const perguntouOutraCoisa = estadoDaConversa({
      historico, mensagemAtual: "tem vaga de garagem?", imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(perguntouOutraCoisa.respondidos.has("capacidade")).toBe(false);
  });

  it("'que horas?' é pedido de horário → propor, não convidar", () => {
    /*
     * Caminho feliz com API, turno 2: "Que horas?" foi ignorado (o planner
     * escolheu o convite) e o cliente teve de repetir. Quem pergunta a hora
     * já aceitou visitar.
     */
    const e = estadoDaConversa({
      historico: [cliente("queria visitar sábado"), bot("Em qual região você procura?")],
      mensagemAtual: "Barueri Centro. Que horas?",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.pediuHorario).toBe(true);
    expect(planejarJogada(e).tipo).toBe("propor_horario");
  });
});

describe("objeção, alternativa e saída suave — o trace do terceiro perfil", () => {
  const CATALOGO = [
    IMOVEL, // 470.000
    { ...IMOVEL, slug: "vista", nome: "Vista AlphaGran", precoAPartir: 800000 } as Empreendimento,
    { ...IMOVEL, slug: "serenne", nome: "Serenne", precoAPartir: 320000 } as Empreendimento,
  ];
  const foco = CATALOGO[1];

  it("'tá caro' → tratar a objeção, nunca uma pergunta de funil", () => {
    const e = estadoDaConversa({
      historico: [cliente("Alphaville, 2 dorm"), bot("O Vista AlphaGran começa em R$ 800.000.")],
      mensagemAtual: "nossa, tá caro. vou pensar",
      imovelEmFoco: foco, catalogo: CATALOGO,
    });
    expect(e.objetouPreco).toBe(true);
    expect(planejarJogada(e).tipo).toBe("tratar_objecao");
  });

  it("'tem algo mais em conta?' → INDICAR a alternativa mais barata fora do foco", () => {
    // Taxonomia: "não ofereceu alternativas" em 6 de 16 conversas.
    const e = estadoDaConversa({
      historico: [cliente("Alphaville"), bot("O Vista AlphaGran começa em R$ 800.000.")],
      mensagemAtual: "tem algo mais em conta?",
      imovelEmFoco: foco, catalogo: CATALOGO,
    });
    const j = planejarJogada(e);
    expect(j.tipo).toBe("indicar_alternativa");
    if (j.tipo === "indicar_alternativa") {
      expect(j.slug).toBe("serenne"); // o mais barato, e não o próprio foco
      expect(j.emVezDe).toBe("Vista AlphaGran");
    }
  });

  it("alternativa vence a objeção quando as duas aparecem na mesma fala", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("O Vista AlphaGran começa em R$ 800.000.")],
      mensagemAtual: "tá caro, tem algo mais barato?",
      imovelEmFoco: foco, catalogo: CATALOGO,
    });
    expect(planejarJogada(e).tipo).toBe("indicar_alternativa");
  });

  it("'vou ver com minha esposa' → porta aberta, sem pergunta nem horário", () => {
    const e = estadoDaConversa({
      historico: [cliente("Alphaville, 2 dorm"), bot("Quer conhecer o decorado?")],
      mensagemAtual: "hmm, vou ver com minha esposa",
      imovelEmFoco: foco, catalogo: CATALOGO,
    });
    expect(e.saidaSuave).toBe(true);
    expect(planejarJogada(e).tipo).toBe("deixar_porta_aberta");
  });

  it("aceite de horário continua ganhando de tudo isso", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Posso te mostrar sábado às 10h?")],
      mensagemAtual: "pode ser, mas tá caro viu",
      imovelEmFoco: foco, catalogo: CATALOGO,
    });
    expect(planejarJogada(e).tipo).toBe("confirmar_visita");
  });

  it("os blocos citam o imóvel certo e nunca o que ele achou caro", () => {
    const b = blocoDaJogada(
      { tipo: "indicar_alternativa", slug: "serenne", nome: "Serenne", piso: 320000, emVezDe: "Vista AlphaGran" },
      { nomeDoFoco: "Vista AlphaGran" },
    );
    expect(b).toContain("INDIQUE: Serenne");
    expect(b).toContain("R$ 320.000");
    expect(b).toMatch(/Não repita o imóvel/);
  });
});

describe("segunda objeção seguida vira alternativa", () => {
  const CATALOGO = [
    IMOVEL,
    { ...IMOVEL, slug: "vista", nome: "Vista AlphaGran", precoAPartir: 800000 } as Empreendimento,
    { ...IMOVEL, slug: "serenne", nome: "Serenne", precoAPartir: 320000 } as Empreendimento,
  ];
  const foco = CATALOGO[1];

  it("primeira objeção → tratar; a segunda seguida → indicar a alternativa", () => {
    const primeira = estadoDaConversa({
      historico: [cliente("Alphaville"), bot("O Vista AlphaGran começa em R$ 800.000.")],
      mensagemAtual: "nossa, tá caro",
      imovelEmFoco: foco, catalogo: CATALOGO,
    });
    expect(primeira.objecoesSeguidas).toBe(1);
    expect(planejarJogada(primeira).tipo).toBe("tratar_objecao");

    const segunda = estadoDaConversa({
      historico: [
        cliente("Alphaville"), bot("O Vista AlphaGran começa em R$ 800.000."),
        cliente("nossa, tá caro"), bot("Entendo. O que você viu por esse valor?"),
      ],
      mensagemAtual: "acho que passa do que eu queria",
      imovelEmFoco: foco, catalogo: CATALOGO,
    });
    expect(segunda.objecoesSeguidas).toBe(2);
    expect(planejarJogada(segunda).tipo).toBe("indicar_alternativa");
  });

  it("a sequência quebra na primeira fala que não é objeção", () => {
    const e = estadoDaConversa({
      historico: [
        cliente("tá caro"), bot("Entendo. O que você viu por esse valor?"),
        cliente("vi um por 500 mil"), bot("Faz sentido."),
      ],
      mensagemAtual: "mas o seu ainda tá caro",
      imovelEmFoco: foco, catalogo: CATALOGO,
    });
    expect(e.objecoesSeguidas).toBe(1);
  });
});

describe("depois da visita confirmada, o funil acaba", () => {
  it("'sábado às 9h está reservado' no histórico → encerrar, sem qualificar", () => {
    /*
     * Sonda do caminho feliz com API: conversão no turno 3, e o funil
     * continuou ("pronto ou na planta?"). O cliente: "não perguntei isso",
     * "só quero ver o apartamento". Bateu o teto de 12 turnos onde antes
     * encerrava no 8.
     */
    const e = estadoDaConversa({
      historico: [
        cliente("queria visitar sábado. que horas?"),
        bot("Sábado às 9h ou 11h?"),
        cliente("9h"),
        bot("Ótimo, sábado às 9h está reservado para você."),
      ],
      mensagemAtual: "pronto pra morar. não perguntei isso",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.visitaConfirmada).toBe(true);
    expect(planejarJogada(e).tipo).toBe("encerrar_confirmado");
  });

  it("aceite ainda vence, e dado pedido também — confirmar/entregar antes de encerrar", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Sábado às 9h está reservado."), cliente("ok"), bot("Até lá!")],
      mensagemAtual: "quanto custa mesmo?",
      imovelEmFoco: IMOVEL, catalogo: [IMOVEL],
    });
    expect(planejarJogada(e).tipo).toBe("responder_dado");
  });
});

describe("pergunta sem dado recebe honestidade na PRIMEIRA vez", () => {
  it("'tem como negociar? e o desconto?' → responder_honesto já no primeiro pedido", () => {
    // Sonda adversarial com API: isso recebia "em qual região você procura?".
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("O mais em conta começa em R$ 470.000. Quer conhecer?")],
      mensagemAtual: "tem como negociar? quero saber do desconto",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.perguntaSemDado).not.toBeNull();
    const j = planejarJogada(e);
    expect(j.tipo).toBe("responder_honesto");
    if (j.tipo === "responder_honesto") expect(j.vezes).toBe(1);
  });

  it("dado que TEMOS continua vencendo o 'sem dado'", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Em qual região você procura?")],
      mensagemAtual: "qual o preço e tem desconto?",
      imovelEmFoco: IMOVEL, catalogo: [IMOVEL],
    });
    expect(planejarJogada(e).tipo).toBe("responder_dado");
  });
});

describe("a regressão da v32: a resposta do cliente conta mesmo sem casar no regex", () => {
  /*
   * Medição 16 × 2: "conversas em que a IA repetiu" dobrou (6,5 → 14), e a
   * pergunta era uma só — "pronto para morar ou na planta?", ~37 vezes.
   * Cliente real responde "pronto", "planta", "tanto faz".
   */
  it.each(["pronto", "planta", "tanto faz", "prefiro pronto", "os dois servem"])(
    "'%s' depois de 'pronto ou na planta?' encerra o assunto",
    (resposta) => {
      const e = estadoDaConversa({
        historico: [cliente("Alphaville"), bot("Você prefere imóvel pronto para morar ou na planta?")],
        mensagemAtual: resposta,
        imovelEmFoco: null, catalogo: [IMOVEL],
      });
      expect(e.respondidos.has("estagio")).toBe(true);
      expect(planejarJogada(e)).not.toEqual({ tipo: "perguntar", assunto: "estagio" });
    },
  );

  it("qualquer resposta sem '?' fecha a pergunta do turno anterior — o regex é só reforço", () => {
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Em qual região de Barueri você procura?")],
      mensagemAtual: "perto do parque, do lado da escola das crianças",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.respondidos.has("regiao")).toBe(true);
  });

  it("mas uma PERGUNTA no lugar da resposta deixa o assunto em aberto", () => {
    // Ele perguntou outra coisa em vez de responder: o planner responde a
    // dele primeiro e pode reperguntar depois — a única repergunta legítima.
    const e = estadoDaConversa({
      historico: [cliente("oi"), bot("Em qual região de Barueri você procura?")],
      mensagemAtual: "vocês têm em Osasco?",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.respondidos.has("regiao")).toBe(false);
  });
});

/**
 * A conversa 2cff42f6 (10/09/2026), relatada assim: "quando eu falo que
 * consigo tal horário ele marca em outro, e quando falo que consigo segunda,
 * ela me pergunta novamente se eu não consigo outro dia".
 *
 * Passada pelo planner, ela mostrou o buraco: quatro falas de agendamento
 * caíram em `perguntar` e `devolver_escolha` — a IA perguntando de novo o que
 * ele acabou de responder. Foram cinco turnos para marcar o que ele disse na
 * primeira frase.
 */
describe("quem está marcando já passou do funil", () => {
  const convite = "Quer conhecer o decorado do Vista AlphaGran?";

  const jogadaPara = (mensagemAtual: string, historico: Fala[] = []) =>
    planejarJogada(
      estadoDaConversa({ historico, mensagemAtual, imovelEmFoco: null, catalogo: [IMOVEL] }),
    );

  it("pedir visita na primeira frase não vira pergunta de estágio", () => {
    expect(jogadaPara("Quero marcar uma visita no amanhã")).toEqual({
      tipo: "agendar",
      dia: "amanhã",
      hora: null,
    });
  });

  it("a contraproposta de dia é agendamento, com o dia NOVO", () => {
    expect(jogadaPara("Sábado eu não consigo, pode ser segunda?")).toEqual({
      tipo: "agendar",
      dia: "segunda-feira",
      hora: null,
    });
  });

  it("dia solto e hora solta param de cair em devolver_escolha", () => {
    expect(jogadaPara("Segunda feira").tipo).toBe("agendar");
    expect(jogadaPara("9h")).toEqual({ tipo: "agendar", dia: null, hora: 9 });
  });

  it("'sim' depois do convite é aceite, não conversa fiada", () => {
    expect(jogadaPara("Sim", [bot(convite)]).tipo).toBe("agendar");
  });

  it("mas resposta de FUNIL que começa com 'pode ser' continua sendo funil", () => {
    // "pode ser na planta" casa em ACEITE pelo "pode ser", e é resposta de
    // estágio. Sem esta guarda, todo o funil viraria agendamento.
    expect(jogadaPara("pode ser na planta", [bot(convite)]).tipo).not.toBe("agendar");
  });

  it("o bloco proíbe qualificar e nomeia o que ele já deu", () => {
    const texto = blocoDaJogada(
      { tipo: "agendar", dia: "segunda-feira", hora: 9 },
      { nomeDoFoco: "Vista AlphaGran" },
    );
    expect(texto).toContain("segunda-feira às 9h");
    expect(texto).toContain("NENHUMA pergunta de qualificação");
  });

  it("com o dia só, manda oferecer os horários DAQUELE dia", () => {
    const texto = blocoDaJogada(
      { tipo: "agendar", dia: "segunda-feira", hora: null },
      { nomeDoFoco: null },
    );
    expect(texto).toContain("NÃO pergunte o dia de novo");
  });
});

describe("a confirmação manda o combinado, não só um 'confirmado'", () => {
  /*
   * Relatado em 10/09/2026. Na conversa 2cff42f6 ela disse "Segunda-feira,
   * 14/09, às 9h está confirmado" e parou — quem marcou visita quer o print
   * para guardar: dia, hora, qual imóvel e com quem.
   */
  const texto = (nomeDoFoco: string | null) =>
    blocoDaJogada({ tipo: "confirmar_visita", oQueEleDisse: "Pode ser esse mesmo" }, { nomeDoFoco });

  it("pede o imóvel e o nome do corretor no resumo", () => {
    expect(texto("Vista AlphaGran")).toContain("no Vista AlphaGran");
    expect(texto("Vista AlphaGran")).toContain("nome do corretor");
  });

  it("sem foco, não inventa imóvel nenhum", () => {
    expect(texto(null)).not.toContain("no null");
    expect(texto(null)).toContain("nome do corretor");
  });

  it("proíbe a IA de escrever endereço — ele vem do cadastro", () => {
    // Endereço inventado leva o cliente ao lugar errado NO DIA da visita.
    expect(texto("Vista AlphaGran")).toContain("NUNCA escreva o endereço");
  });
});


/**
 * A recusa — a jogada que faltava, e a que o planner fazia ao contrário.
 *
 * Medido em produção: "No momento não tenho interesse. Obrigada" (01/09
 * 13:25) foi respondido com "Me conta, em qual região de Barueri você
 * procura?". A fala não classificada caía no funil, e recusa não era
 * classificada por ninguém.
 */
describe("a recusa ganha de tudo", () => {
  it("recusa explícita NUNCA cai no funil", () => {
    const e = estadoDaConversa({
      historico: [bot("Oi! Temos apartamentos em Barueri.")],
      mensagemAtual: "No momento não tenho interesse. Obrigada",
      imovelEmFoco: null,
      catalogo: [],
    });
    const j = planejarJogada(e);
    expect(j.tipo).toBe("acolher_recusa");
    if (j.tipo === "acolher_recusa") expect(j.familia).toBe("desinteresse");
  });

  it("pedido de parada encerra na hora, sem tentar entender o motivo", () => {
    const e = estadoDaConversa({
      historico: [bot("Quer conhecer o decorado?")],
      mensagemAtual: "me tira da lista",
      imovelEmFoco: null,
      catalogo: [],
    });
    expect(planejarJogada(e).tipo).toBe("encerrar_recusado");
  });

  it("quem JÁ RESOLVEU também não é perguntado — não há o que reofertar", () => {
    const e = estadoDaConversa({
      historico: [bot("Tenho uma opção em Alphaville.")],
      mensagemAtual: "já comprei outro, obrigado",
      imovelEmFoco: null,
      catalogo: [],
    });
    expect(planejarJogada(e).tipo).toBe("encerrar_recusado");
  });

  it("a SEGUNDA recusa encerra", () => {
    const e = estadoDaConversa({
      historico: [
        cliente("não tenho interesse"),
        bot("Entendi! Só pra eu saber: foi preço ou região?"),
      ],
      mensagemAtual: "já falei que não quero",
      imovelEmFoco: null,
      catalogo: [],
    });
    expect(planejarJogada(e).tipo).toBe("encerrar_recusado");
  });

  /*
   * A ordem importa mais aqui do que em qualquer outro lugar do planner: o
   * detector de ACEITE casaria em "pode parar", e marcar visita para quem
   * acabou de pedir para ser deixado em paz é o pior desfecho possível.
   */
  it("ganha até do aceite de horário", () => {
    const e = estadoDaConversa({
      historico: [bot("Tenho sábado às 10h ou domingo às 11h.")],
      mensagemAtual: "não tenho interesse, pode parar",
      imovelEmFoco: null,
      catalogo: [],
    });
    expect(planejarJogada(e).tipo).toBe("encerrar_recusado");
  });

  it("mas preferência continua sendo conversa", () => {
    const e = estadoDaConversa({
      historico: [bot("Temos pronto e na planta.")],
      mensagemAtual: "não quero na planta",
      imovelEmFoco: null,
      catalogo: [],
    });
    expect(planejarJogada(e).tipo).not.toBe("acolher_recusa");
    expect(planejarJogada(e).tipo).not.toBe("encerrar_recusado");
  });
});

describe("o bloco da recusa", () => {
  it("acolher: pergunta o motivo e não oferece nada", () => {
    const t = blocoDaJogada(
      { tipo: "acolher_recusa", familia: "desinteresse", oQueEleDisse: "não tenho interesse" },
      { nomeDoFoco: null },
    );
    expect(t).toContain("motivo");
    expect(t).toContain("NÃO ofereça visita");
  });

  it("parada: nem pergunta o motivo — ele pediu para parar", () => {
    const t = blocoDaJogada({ tipo: "encerrar_recusado", familia: "parada" }, { nomeDoFoco: null });
    expect(t.toLowerCase()).toContain("não será mais procurado");
    /*
     * A primeira versão deste caso exigia que a palavra "motivo" NÃO
     * aparecesse — e reprovava o texto certo, que diz "nunca pergunte o
     * motivo". Critério que mede a palavra em vez do comportamento é
     * decorativo, e esta base já perdeu tempo com cinco deles.
     */
    expect(t).toContain("Nunca pergunte o motivo");
    expect(t).toContain("Nenhuma pergunta");
  });

  it("desinteresse confirmado: despedida com porta aberta, sem pergunta", () => {
    const t = blocoDaJogada({ tipo: "encerrar_recusado", familia: "desinteresse" }, { nomeDoFoco: null });
    expect(t).toContain("porta aberta");
    expect(t).toContain("Nenhuma pergunta");
  });
});

/**
 * "Muda de assunto sozinha" — a terceira queixa de 11/09/2026.
 *
 * Fala que o planner não classifica cai no funil. É daí que sai "em qual
 * região você procura?" na cara de quem acabou de perguntar outra coisa —
 * e, do lado do cliente, isso é a mesma sensação de não ter sido ouvido.
 */
describe("quando não entende, responde ELE", () => {
  it("pergunta que o planner não classifica NÃO vira pergunta de funil", () => {
    const e = estadoDaConversa({
      historico: [bot("Temos ótimas opções em Barueri.")],
      mensagemAtual: "o condomínio aceita cachorro de porte grande?",
      imovelEmFoco: null,
      catalogo: [],
    });
    expect(planejarJogada(e).tipo).toBe("responder_pergunta_aberta");
  });

  /*
   * A régua de "é pergunta" não pode depender da ORDEM das palavras: "onde
   * fica" e "fica onde" são a mesma pergunta, e foi exatamente isso que fez
   * a IA ignorar um cliente em 10/09.
   */
  it("não depende da ordem das palavras nem da interrogação", () => {
    const pergunta = (texto: string) =>
      planejarJogada(
        estadoDaConversa({
          historico: [bot("Oi!")],
          mensagemAtual: texto,
          imovelEmFoco: null,
          catalogo: [],
        }),
      ).tipo;

    expect(pergunta("fica onde o condomínio")).toBe("responder_pergunta_aberta");
    expect(pergunta("me manda a ficha completa")).toBe("responder_pergunta_aberta");
  });

  it("afirmação sem pergunta continua deixando o funil andar", () => {
    const e = estadoDaConversa({
      historico: [bot("Oi!")],
      mensagemAtual: "bom dia",
      imovelEmFoco: null,
      catalogo: [],
    });
    expect(planejarJogada(e).tipo).toBe("perguntar");
  });

  it("e a recusa continua ganhando dela", () => {
    const e = estadoDaConversa({
      historico: [bot("Oi!")],
      mensagemAtual: "não tenho interesse, pode me tirar da lista?",
      imovelEmFoco: null,
      catalogo: [],
    });
    expect(planejarJogada(e).tipo).toBe("encerrar_recusado");
  });

  it("o bloco manda responder e proíbe trocar de assunto", () => {
    const t = blocoDaJogada(
      { tipo: "responder_pergunta_aberta", oQueEleDisse: "aceita pet?" },
      { nomeDoFoco: null },
    );
    expect(t).toContain("aceita pet?");
    expect(t).toContain("nunca invente");
  });
});

/**
 * "Não retoma depois de dias" — a quarta queixa de 11/09/2026.
 *
 * O cliente some, volta a escrever, e ela segue como se a conversa nunca
 * tivesse parado. A decisão do usuário foi CONFIRMAR se ainda vale, citando
 * o que já se sabe, com uma pergunta só — mais seguro que emendar no
 * assunto, porque muita coisa muda numa semana.
 */
describe("a retomada depois de dias", () => {
  const voltou = (texto: string, horas: number) =>
    planejarJogada(
      estadoDaConversa({
        historico: [cliente("procuro em Alphaville"), bot("Te mando a planta hoje.")],
        mensagemAtual: texto,
        horasDesdeAUltimaFala: horas,
        imovelEmFoco: null,
        catalogo: [],
      }),
    );

  it("acima de 72h, confirma se ainda vale", () => {
    expect(voltou("oi", 96).tipo).toBe("retomar");
  });

  it("abaixo de 72h a conversa segue como sempre", () => {
    expect(voltou("oi", 20).tipo).not.toBe("retomar");
  });

  /*
   * Quem volta PERGUNTANDO já disse que ainda vale. Responder "você ainda
   * está procurando?" a quem perguntou a planta é a mesma troca de assunto
   * que a jogada anterior veio consertar.
   */
  it("mas pergunta em aberto ganha da retomada", () => {
    expect(voltou("conseguiu ver a planta do 3 dorm?", 96).tipo).not.toBe("retomar");
  });

  it("e a recusa também ganha — ele voltou para dizer que não quer", () => {
    expect(voltou("não tenho interesse mais", 96).tipo).toBe("acolher_recusa");
  });

  it("o bloco diz os dias e proíbe recomeçar a qualificação", () => {
    const t = blocoDaJogada({ tipo: "retomar", horas: 96 }, { nomeDoFoco: "Terra Alta" });
    expect(t).toContain("4 dias");
    expect(t).toContain("MEMÓRIA");
    expect(t).toContain("UMA pergunta");
  });
});

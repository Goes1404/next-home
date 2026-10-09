import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aceiteDeVisitaValido,
  blocoDaJogada,
  blocoDeQualificacao,
  travaDeQualificacao,
  estadoDaConversa,
  planejarJogada,
  type EstadoDaConversa,
} from "./jogada";
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
    visitaMarcada: null,
    mudancaDeVisita: null,
    aceitouOferta: null,
    clienteColaborando: false,
    jaIndicouImovel: false,
    perguntaSemDado: null,
    agendamento: { dia: null, hora: null, pediuVisita: false },
    recusa: null,
    duvidaSobreOContato: null,
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

  /*
   * Reescrito em 28/09/2026, por decisão do usuário: "as perguntas têm que
   * ser antes de recomendar um imóvel, é com base nelas que identificamos o
   * melhor imóvel para a situação do cliente". Até a v41 a IA convidava
   * assim que sabia a região ("convida CEDO") e a capacidade só entrava se
   * sobrasse espaço. Agora a ordem é: as quatro perguntas → a indicação →
   * o convite → o horário.
   */
  it("capacidade é pergunta do funil: vem antes de indicar", () => {
    const j = planejarJogada(estado({ respondidos: new Set(["regiao", "estagio", "tipologia"]), falasDoCliente: 3 }));
    expect(j).toEqual({ tipo: "perguntar", assunto: "capacidade" });
  });

  it("não convida nem indica sabendo só a região", () => {
    const j = planejarJogada(estado({ respondidos: new Set(["regiao"]), falasDoCliente: 2 }));
    expect(j).toEqual({ tipo: "perguntar", assunto: "estagio" });
  });

  it("funil completo: indica primeiro, convida depois, e só então o horário", () => {
    const completo = new Set(["regiao", "estagio", "tipologia", "capacidade"] as const);
    expect(planejarJogada(estado({ respondidos: completo, falasDoCliente: 5 }))).toEqual({ tipo: "indicar_imovel" });
    expect(planejarJogada(estado({ respondidos: completo, jaIndicouImovel: true, falasDoCliente: 5 }))).toEqual({
      tipo: "convidar_visita",
    });
    expect(
      planejarJogada(estado({ respondidos: completo, jaIndicouImovel: true, convidouVisita: true, horariosOferecidos: 0, falasDoCliente: 5 })),
    ).toEqual({ tipo: "propor_horario", jaOfereceu: 0 });

    // Dois horários recusados: insistir num terceiro é o loop com outra roupa.
    expect(
      planejarJogada(estado({ respondidos: completo, jaIndicouImovel: true, convidouVisita: true, horariosOferecidos: 2, falasDoCliente: 6 })),
    ).toEqual({ tipo: "devolver_escolha" });
  });

  it("pergunta ignorada duas vezes sai do caminho e não trava a indicação", () => {
    const j = planejarJogada(
      estado({
        respondidos: new Set(["regiao", "estagio", "tipologia"]),
        vezesPerguntado: new Map([["capacidade", 2]]),
        perguntadosNaUltima: new Set(["capacidade"]),
        falasDoCliente: 6,
      }),
    );
    expect(j).toEqual({ tipo: "indicar_imovel" });
  });
});

describe("trava da qualificação", () => {
  it("vale enquanto falta pergunta, e sai com o funil completo", () => {
    const aberto = estado({ respondidos: new Set(["regiao"]) });
    expect(travaDeQualificacao({ tipo: "responder_pergunta_aberta", oQueEleDisse: "tem 2 dorm?" }, aberto)).toBe("estagio");
    const fechado = estado({ respondidos: new Set(["regiao", "estagio", "tipologia", "capacidade"]) });
    expect(travaDeQualificacao({ tipo: "indicar_imovel" }, fechado)).toBeNull();
  });

  it("não vale em recusa nem em saída suave (ali não se pergunta nada)", () => {
    const aberto = estado({ respondidos: new Set() });
    expect(travaDeQualificacao({ tipo: "acolher_recusa", familia: "desinteresse", oQueEleDisse: "não" }, aberto)).toBeNull();
    expect(travaDeQualificacao({ tipo: "deixar_porta_aberta", oQueEleDisse: "vou pensar" }, aberto)).toBeNull();
  });

  it("o bloco proíbe indicar e termina na pergunta que falta", () => {
    const b = blocoDeQualificacao("tipologia", { nomeDoFoco: null });
    expect(b).toMatch(/NÃO cite nenhum imóvel/);
    expect(b).toMatch(/quantos dormitórios/);
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

  /*
   * Reescrito em 29/09/2026: a capacidade deixou de fechar com qualquer
   * resposta. Decisão do usuário: ela sai da RENDA (ou da profissão), e é o
   * número que alimenta a conta do teto. Quem desconversa ouve a pergunta
   * UMA vez mais; na segunda, o assunto sai do caminho (vale a régua de não
   * virar formulário). As outras perguntas do funil continuam fechando com
   * qualquer resposta sem "?".
   */
  it("a capacidade que o bot perguntou e ele não respondeu volta UMA vez", () => {
    const e = estadoDaConversa({
      historico: [
        cliente("procuro em Alphaville, 2 dormitórios, na planta"),
        bot("Pra eu calcular o que o banco aprova, qual é a renda média da família por mês?"),
      ],
      mensagemAtual: "sou professor",
      dossie: null, imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.perguntadosNaUltima.has("capacidade")).toBe(true);
    expect(e.respondidos.has("capacidade")).toBe(false);
    expect(planejarJogada(e)).toEqual({ tipo: "perguntar", assunto: "capacidade" });

    const segunda = estadoDaConversa({
      historico: [
        cliente("procuro em Alphaville, 2 dormitórios, na planta"),
        bot("Qual é a renda média da família por mês?"),
        cliente("sou professor"),
        bot("Legal! E a renda média da família, mais ou menos?"),
      ],
      mensagemAtual: "prefiro não dizer",
      dossie: null, imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(planejarJogada(segunda)).not.toEqual({ tipo: "perguntar", assunto: "capacidade" });
  });

  it("renda dita com número fecha a capacidade", () => {
    const e = estadoDaConversa({
      historico: [cliente("Alphaville, 2 dormitórios, na planta"), bot("Qual é a renda média da família por mês?")],
      mensagemAtual: "uns 4000",
      imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(e.respondidos.has("capacidade")).toBe(true);
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
     * reperguntava e regrediu (IA repetiu 6,5 → 14). Qualquer resposta sem
     * "?" fecha a pergunta do turno anterior (a capacidade é a exceção
     * declarada acima: ela volta uma vez); a repergunta só cabe quando ele
     * perguntou outra coisa em vez de responder.
     */
    const historico = [cliente("Alphaville, 2 dormitórios"), bot("Você prefere pronto para morar ou na planta?")];

    const desconversou = estadoDaConversa({
      historico, mensagemAtual: "tanto faz, quero ver fotos!", imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(desconversou.respondidos.has("estagio")).toBe(true);

    const perguntouOutraCoisa = estadoDaConversa({
      historico, mensagemAtual: "tem vaga de garagem?", imovelEmFoco: null, catalogo: [IMOVEL],
    });
    expect(perguntouOutraCoisa.respondidos.has("estagio")).toBe(false);
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

  // Com imóvel em foco (o do anúncio, ou o que a IA já indicou): é o caso
  // em que quem está marcando não espera o funil. Sem foco, ver abaixo.
  const jogadaPara = (mensagemAtual: string, historico: Fala[] = []) =>
    planejarJogada(
      estadoDaConversa({ historico, mensagemAtual, imovelEmFoco: IMOVEL, catalogo: [IMOVEL] }),
    );

  /*
   * Decisão de 28/09/2026: sem imóvel escolhido e sem as perguntas, "quero
   * marcar uma visita" ganha as perguntas primeiro, para saber QUAL decorado
   * mostrar. O bloco de `perguntar` já manda reagir ao que ele disse antes.
   */
  it("sem imóvel e sem perguntas, pedir visita começa pelas perguntas", () => {
    const j = planejarJogada(
      estadoDaConversa({ historico: [], mensagemAtual: "Quero marcar uma visita no amanhã", imovelEmFoco: null, catalogo: [IMOVEL] }),
    );
    expect(j).toEqual({ tipo: "perguntar", assunto: "regiao" });
  });

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

  /*
   * Reescrito em 28/09/2026: sem foco, a confirmação deixou de sair. O eval
   * de conversa flagrou "combinado para sábado às 11h com a Sofia" sem
   * imóvel nenhum, e o cliente pediu o endereço seis vezes. Sem imóvel não
   * existe visita: o bloco segura o horário e pergunta QUAL imóvel.
   */
  it("sem foco, não inventa imóvel nenhum e pergunta qual é", () => {
    expect(texto(null)).not.toContain("no null");
    expect(texto(null)).toMatch(/qual (dos )?im[óo]ve/i);
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

/*
 * Eval de conversa, 28/09/2026 (`sem-perfil-de-renda`): "queria sair do
 * aluguel, pago 900 HOJE, da pra financiar" virou `agendar` para hoje, e a
 * IA ofereceu horário no stand para quem perguntou de financiamento. Dia
 * da semana solto só é agendamento quando a conversa está falando de visita.
 */
describe("dia solto sem assunto de visita não é agendamento", () => {
  const catalogo = [IMOVEL];

  it("\"hoje\" no meio de uma pergunta de financiamento não marca nada", () => {
    const j = planejarJogada(
      estadoDaConversa({
        historico: [],
        mensagemAtual: "queria sair do aluguel, pago 900 hoje, da pra financiar",
        imovelEmFoco: null,
        catalogo,
      }),
    );
    expect(j.tipo).not.toBe("agendar");
  });

  it("o dia continua valendo quando ele fala em visitar", () => {
    const j = planejarJogada(
      estadoDaConversa({
        historico: [],
        mensagemAtual: "queria visitar um apartamento sábado, dá?",
        imovelEmFoco: IMOVEL,
        catalogo,
      }),
    );
    expect(j.tipo).toBe("agendar");
  });

  it("e quando responde ao convite do bot", () => {
    const j = planejarJogada(
      estadoDaConversa({
        historico: [bot("Quer conhecer o decorado do Terra Alta?")],
        mensagemAtual: "segunda feira",
        imovelEmFoco: IMOVEL,
        catalogo,
      }),
    );
    expect(j.tipo).toBe("agendar");
  });
});

/*
 * Eval de conversa, 28/09/2026 (`quer-visitar-sabado`): "11h então" virou
 * visita confirmada sem imóvel nenhum ("combinado para sábado às 11h com a
 * Sofia"), e o cliente pediu o endereço seis vezes. Sem imóvel não existe
 * visita; e quem recebe o cliente é o corretor, nunca a assistente.
 */
describe("marcar visita sem saber QUAL imóvel", () => {
  it("agendar sem foco pede o imóvel antes de fechar", () => {
    const b = blocoDaJogada({ tipo: "agendar", dia: "sábado", hora: null }, { nomeDoFoco: null });
    expect(b).toMatch(/qual (dos )?im[óo]ve/i);
  });

  it("confirmar sem foco segura o horário e pergunta o imóvel", () => {
    const b = blocoDaJogada({ tipo: "confirmar_visita", oQueEleDisse: "11h então" }, { nomeDoFoco: null });
    expect(b).toMatch(/qual (dos )?im[óo]ve/i);
    expect(b).not.toMatch(/"confirmadaPeloCliente": true/);
  });

  it("com foco, confirma normalmente", () => {
    const b = blocoDaJogada({ tipo: "confirmar_visita", oQueEleDisse: "11h" }, { nomeDoFoco: "Terra Alta" });
    expect(b).toMatch(/"confirmadaPeloCliente": true/);
  });

  it("quem recebe o cliente é o corretor, não a assistente", () => {
    const b = blocoDaJogada({ tipo: "confirmar_visita", oQueEleDisse: "11h" }, { nomeDoFoco: "Terra Alta" });
    expect(b).toMatch(/nunca o seu/i);
  });
});

/*
 * Eval de conversa, 28/09/2026. Três leituras erradas do planner, todas
 * sobre dado que o cliente já tinha dado ou estava pedindo:
 *   - "2 dorm" não contava como tipologia, e a IA perguntou "quantos
 *     dormitórios?" a quem tinha acabado de dizer.
 *   - "preciso falar com ela" não era saída suave, e a IA ofereceu horário
 *     cinco vezes a quem ia conversar com a esposa.
 *   - "pago 900 de aluguel, dá pra financiar?" contava como RENDA
 *     respondida e caía no funil; a pergunta de financiamento sumia e a
 *     renda nunca era perguntada.
 */
describe("o que o cliente disse de verdade", () => {
  const catalogo = [IMOVEL];
  const planejar = (mensagemAtual: string, historico: Fala[] = []) => {
    const e = estadoDaConversa({ historico, mensagemAtual, imovelEmFoco: null, catalogo });
    return { e, j: planejarJogada(e) };
  };

  it("\"2 dorm\" responde a tipologia", () => {
    const { e } = planejar("Barueri centro\n2 dorm");
    expect(e.respondidos.has("tipologia")).toBe(true);
  });

  it("\"preciso falar com ela\" é saída suave", () => {
    const { j } = planejar("preciso falar com ela", [bot("Quer conhecer o decorado?")]);
    expect(j.tipo).toBe("deixar_porta_aberta");
  });

  it("valor de aluguel não é renda respondida", () => {
    const { e } = planejar("pago 900 de aluguel");
    expect(e.respondidos.has("capacidade")).toBe(false);
  });

  it("renda dita com número é capacidade respondida", () => {
    expect(planejar("minha renda é 6 mil").e.respondidos.has("capacidade")).toBe(true);
    expect(planejar("tenho até 400 mil").e.respondidos.has("capacidade")).toBe(true);
  });

  it("\"dá pra financiar?\" é respondida, e a resposta pede a renda", () => {
    const { j } = planejar("queria sair do aluguel, pago 900 hoje, da pra financiar");
    expect(j.tipo).toBe("responder_pergunta_aberta");
    expect(blocoDaJogada(j, { nomeDoFoco: null })).toMatch(/renda/i);
  });
});

/*
 * Produção, 28/09/2026: "Quer que eu te envie a apresentação digital?" →
 * "Quero Simm" caiu em `devolver_escolha`. Aceite de material oferecido se
 * cumpre.
 */
describe("aceitou o material que a IA ofereceu", () => {
  const catalogo = [IMOVEL];
  const jogadaPara = (mensagemAtual: string, ultimaDoBot: string) =>
    planejarJogada(
      estadoDaConversa({ historico: [bot(ultimaDoBot)], mensagemAtual, imovelEmFoco: IMOVEL, catalogo }),
    );

  it("\"quero simm\" depois da oferta da apresentação entrega a apresentação", () => {
    const j = jogadaPara("Quero Simm", "Quer que eu te envie a apresentação digital para você conhecer melhor?");
    expect(j.tipo).toBe("entregar_oferta");
    expect(blocoDaJogada(j, { nomeDoFoco: "Terra Alta" })).toMatch(/link da página/);
  });

  it("\"pode mandar\" depois de oferecer fotos", () => {
    expect(jogadaPara("pode mandar", "Posso te mandar as fotos do Terra Alta?").tipo).toBe("entregar_oferta");
  });

  it("resposta longa com outra coisa não é só aceite", () => {
    expect(
      jogadaPara("sim mas antes me diz quanto é o condomínio e se aceita pet", "Posso te mandar as fotos?").tipo,
    ).not.toBe("entregar_oferta");
  });

  it("sem oferta de envio, \"sim\" não entrega nada", () => {
    expect(jogadaPara("sim", "Você prefere pronto para morar ou na planta?").tipo).not.toBe("entregar_oferta");
  });
});

// Produção, 28/09/2026: quem pediu "algo que entregue o ano que vem" já disse
// que quer na planta, e ouviu "pronto para morar ou na planta?" dois turnos
// depois.
it("pedir prazo de entrega já responde o estágio", () => {
  const e = estadoDaConversa({
    historico: [cliente("Tem algo que entregue o ano que vem ?"), bot("O Estação 267 é pronto para morar.")],
    mensagemAtual: "Quero informações do manaca",
    imovelEmFoco: IMOVEL,
    catalogo: [IMOVEL],
  });
  expect(e.respondidos.has("estagio")).toBe(true);
});

// Eval de 28/09/2026: capacidade perguntada em 1 de 16 conversas. Depois da
// visita marcada, UMA pergunta, com a razão (a simulação que o corretor leva).
describe("depois da visita confirmada, a simulação", () => {
  const confirmou = bot("Combinado: sábado às 10h no Terra Alta, com o Eduardo.");

  it("sem capacidade conhecida, pede a renda com a razão", () => {
    const j = planejarJogada(
      estadoDaConversa({ historico: [confirmou], mensagemAtual: "beleza, obrigado", imovelEmFoco: IMOVEL, catalogo: [IMOVEL] }),
    );
    expect(j).toEqual({ tipo: "encerrar_confirmado", prepararSimulacao: true });
    expect(blocoDaJogada(j, { nomeDoFoco: "Terra Alta" })).toMatch(/simulação/);
  });

  it("com a renda já dita, não pergunta", () => {
    const j = planejarJogada(
      estadoDaConversa({
        historico: [cliente("minha renda é 7 mil"), confirmou],
        mensagemAtual: "beleza",
        imovelEmFoco: IMOVEL,
        catalogo: [IMOVEL],
      }),
    );
    expect(j).toEqual({ tipo: "encerrar_confirmado", prepararSimulacao: false });
  });

  it("se ele perguntou algo, responde primeiro e não pergunta", () => {
    const j = planejarJogada(
      estadoDaConversa({ historico: [confirmou], mensagemAtual: "onde fica mesmo?", imovelEmFoco: IMOVEL, catalogo: [IMOVEL] }),
    );
    expect(j.tipo === "encerrar_confirmado" && j.prepararSimulacao).toBe(false);
  });
});

describe("aceite de visita: quem decide é o planner", () => {
  it("só confirmar_visita, ou agendar com a hora dita, e com imóvel", () => {
    expect(aceiteDeVisitaValido({ tipo: "confirmar_visita", oQueEleDisse: "9h" }, true)).toBe(true);
    expect(aceiteDeVisitaValido({ tipo: "agendar", dia: "sábado", hora: 9 }, true)).toBe(true);
    expect(aceiteDeVisitaValido({ tipo: "agendar", dia: "sábado", hora: null }, true)).toBe(false);
    expect(aceiteDeVisitaValido({ tipo: "confirmar_visita", oQueEleDisse: "9h" }, false)).toBe(false);
    // investidor-objetivo, 28/09/2026: perguntava metragem e ganhou visita.
    expect(aceiteDeVisitaValido({ tipo: "responder_pergunta_aberta", oQueEleDisse: "tamanho 30" }, true)).toBe(false);
  });

  it("\"falo com ela\" também é saída suave", () => {
    const j = planejarJogada(
      estadoDaConversa({ historico: [bot("Quer conhecer o decorado?")], mensagemAtual: "Falo com ela", imovelEmFoco: null, catalogo: [IMOVEL] }),
    );
    expect(j.tipo).toBe("deixar_porta_aberta");
  });
});

// v42, 29/09/2026: "R$ 249k?" era o cliente repetindo o piso com espanto, e
// fechava a qualificação como se fosse a faixa dele.
it("número em pergunta não é capacidade dita", () => {
  const e = estadoDaConversa({
    historico: [],
    mensagemAtual: "R$ 249k?\nPreciso saber valor exato",
    imovelEmFoco: null,
    catalogo: [IMOVEL],
  });
  expect(e.respondidos.has("capacidade")).toBe(false);
  const dita = estadoDaConversa({ historico: [], mensagemAtual: "tenho uns 300 mil", imovelEmFoco: null, catalogo: [IMOVEL] });
  expect(dita.respondidos.has("capacidade")).toBe(true);
});

it("\"renda não importa\" não responde a capacidade", () => {
  const e = estadoDaConversa({
    historico: [bot("Qual é a renda mensal da família?")],
    mensagemAtual: "renda não importa, quero o preço só",
    imovelEmFoco: null,
    catalogo: [IMOVEL],
  });
  expect(e.respondidos.has("capacidade")).toBe(false);
});

/*
 * 29/09/2026: cruzar os dados sem interrogatório. Quem responde curto e na
 * sequência ouve pronto/planta e dormitórios numa frase só.
 */
describe("duas perguntas leves numa mensagem", () => {
  it("cliente colaborando: estágio e dormitórios juntos", () => {
    const e = estadoDaConversa({
      historico: [bot("Em qual região de Barueri você procura?")],
      mensagemAtual: "Alphaville",
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });
    const j = planejarJogada(e);
    expect(j).toEqual({ tipo: "perguntar", assunto: "estagio", junto: "tipologia" });
    expect(blocoDaJogada(j, { nomeDoFoco: null })).toMatch(/DUAS perguntas curtas/);
  });

  it("quem perguntou alguma coisa recebe uma pergunta só", () => {
    const e = estadoDaConversa({
      historico: [bot("Em qual região de Barueri você procura?")],
      mensagemAtual: "Alphaville, e vocês têm decorado lá?",
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });
    const j = planejarJogada(e);
    expect(j.tipo === "perguntar" && j.junto).toBeFalsy();
  });

  it("a renda nunca vai junto com outra pergunta", () => {
    const e = estadoDaConversa({
      historico: [cliente("Alphaville"), bot("Prefere pronto ou na planta, e de quantos dormitórios?")],
      mensagemAtual: "na planta, 2 dormitórios",
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });
    expect(planejarJogada(e)).toEqual({ tipo: "perguntar", assunto: "capacidade" });
  });
});

describe("quem chega pedindo UM imóvel já respondeu região e estágio (03/10/2026)", () => {
  /*
   * Anúncio do Dom Parque: "Gostaria de mais informações do Dom Parque" era
   * respondido com "em qual região de Barueri você procura?" — que soa como
   * oferecer outra coisa. A próxima pergunta é a de dormitórios.
   */
  it("com o foco trazido pelo cliente, a pergunta é a de dormitórios", () => {
    const e = estadoDaConversa({
      historico: [],
      mensagemAtual: "Olá! Gostaria de mais informações do Terra Alta.",
      imovelEmFoco: IMOVEL,
      catalogo: [IMOVEL],
      focoDoCliente: true,
    });
    expect(e.respondidos.has("regiao")).toBe(true);
    expect(e.respondidos.has("estagio")).toBe(true);
    const j = planejarJogada(e);
    expect(j.tipo === "perguntar" ? j.assunto : null).toBe("tipologia");
  });

  it("sem foco do cliente, a região continua sendo perguntada", () => {
    const e = estadoDaConversa({
      historico: [],
      mensagemAtual: "oi, quero um apartamento",
      imovelEmFoco: null,
      catalogo: [IMOVEL],
    });
    expect(e.respondidos.has("regiao")).toBe(false);
  });

  it("o turno marca o foco do cliente pelo nome que ele escreveu", () => {
    const codigo = readFileSync("src/lib/whatsapp/turnoDeAtendimento.ts", "utf8");
    expect(codigo).toMatch(/focoDoCliente: foco\s*\?/);
  });
});

/*
 * A recusa em camadas (06/10/2026): a recusa que a IA reconheceu chega ao
 * planner pronta, e as recusas anteriores que só a IA viu contam para o
 * segundo "não" encerrar em vez de perguntar o motivo de novo.
 */
describe("recusa vinda da IA", () => {
  const base = {
    historico: [bot("Posso te mostrar as plantas?")],
    mensagemAtual: "deixa pra lá",
    imovelEmFoco: null,
    catalogo: [IMOVEL],
  };

  it("a recusa classificada substitui a regex", () => {
    const e = estadoDaConversa({ ...base, recusa: { familia: "desinteresse", trecho: "deixa pra lá" } });
    expect(planejarJogada(e).tipo).toBe("acolher_recusa");
  });

  it("recusa nula da camada vence a regex (a IA disse que não era)", () => {
    const e = estadoDaConversa({ ...base, mensagemAtual: "não quero", recusa: null });
    expect(planejarJogada(e).tipo).not.toBe("acolher_recusa");
  });

  it("a segunda recusa encerra quando a primeira foi reconhecida pela IA", () => {
    const e = estadoDaConversa({
      ...base,
      recusa: { familia: "desinteresse", trecho: "deixa pra lá" },
      recusasAnterioresExtra: 1,
    });
    expect(planejarJogada(e)).toEqual({ tipo: "encerrar_recusado", familia: "desinteresse" });
  });
});

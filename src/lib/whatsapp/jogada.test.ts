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

  it("NUNCA repete a pergunta que acabou de fazer", () => {
    /*
     * É o que três versões de prompt não conseguiram: "não repita" era uma
     * súplica no texto. Aqui é comparação de conjuntos.
     */
    const j = planejarJogada(
      estado({ perguntadosNaUltima: new Set(["regiao"]), falasDoCliente: 1 }),
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

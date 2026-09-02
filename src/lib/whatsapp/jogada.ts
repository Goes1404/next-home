import type { DossieClienteIA } from "./types";
import type { Empreendimento } from "@/lib/types";
import { assuntosDe, perguntasDe } from "./metricasConversa";
import { dadoPedido, type DadoPedido } from "./dadoPedido";
import { perguntaIgnorada, type PerguntaIgnorada } from "./perguntaIgnorada";
import { horariosJaOferecidos } from "./ofertasDeVisita";
import { capacidadeEstaPendente } from "./funilQualificacao";

/**
 * A JOGADA: o que esta mensagem vai fazer, decidido ANTES de escrever.
 *
 * ## O gargalo que isto ataca
 *
 * Três versões de prompt atacaram repetição e nenhuma moveu o desfecho. A
 * causa, medida: a jogada (responder / perguntar / convidar / propor
 * horário) estava implícita no texto — não era um objeto que o código
 * enxergasse. Não dá para proibir repetir o que não se vê.
 *
 * E o prompt que decidia E escrevia ao mesmo tempo tinha 36 mil caracteres
 * e 37 regras competindo. Instrução de prompt é probabilística, e medimos
 * quanto: a permissão de dar o piso, escrita no prompt, era usada em 30%
 * das conversas; injetada como bloco determinístico, em 10 de 12.
 *
 * ## Por que o planner é DETERMINÍSTICO, não outro LLM
 *
 * A ordem do funil é fixa e foi medida numa corretora real que fecha
 * negócio: região → pronto ou planta → tipologia → o que cabe no bolso →
 * indicação → visita, com o convite cedo e o horário depois. Decidir "qual
 * é a próxima jogada" é olhar o que já foi perguntado, o que já foi
 * respondido e o que o cliente acabou de pedir. Isso é função pura sobre o
 * histórico — e função pura vale sempre, é testável, e roda igual no
 * webhook e no eval sem custar uma chamada.
 *
 * O LLM fica com o que ele faz bem: escrever UMA mensagem, na voz da casa,
 * executando UMA jogada. É o padrão planner/executor da literatura de
 * agentes, com o planner no lugar em que ele cabe.
 *
 * ## O que muda por construção
 *
 * Repetir a mesma jogada vira impossível: `planejarJogada` nunca devolve
 * uma pergunta que a IA fez na mensagem anterior, nem um assunto que o
 * cliente já respondeu. Antes isso era uma súplica no prompt ("não
 * repita"); agora é uma comparação de objetos.
 */

export type AssuntoDoFunil = "regiao" | "estagio" | "tipologia" | "capacidade";

/** A ordem é a da corretora real. Não é configurável de propósito. */
export const ORDEM_DO_FUNIL: AssuntoDoFunil[] = ["regiao", "estagio", "tipologia", "capacidade"];

export type Jogada =
  | { tipo: "responder_dado"; dado: DadoPedido }
  | { tipo: "responder_honesto"; pergunta: string; vezes: number }
  | { tipo: "perguntar"; assunto: AssuntoDoFunil }
  | { tipo: "convidar_visita" }
  | { tipo: "propor_horario"; jaOfereceu: number }
  | { tipo: "devolver_escolha" };

import type { Fala } from "./rajada";

export interface EstadoDaConversa {
  /** Assuntos do funil que o cliente já cobriu (na fala ou no dossiê). */
  respondidos: Set<AssuntoDoFunil>;
  /** Assuntos que a IA perguntou na ÚLTIMA mensagem dela. */
  perguntadosNaUltima: Set<AssuntoDoFunil>;
  /** Assuntos que a IA já perguntou em qualquer momento. */
  perguntadosAlgumaVez: Set<AssuntoDoFunil>;
  convidouVisita: boolean;
  horariosOferecidos: number;
  pedidoEmAberto: DadoPedido | null;
  perguntaRepetida: PerguntaIgnorada | null;
  falasDoCliente: number;
  capacidadePendente: boolean;
}

/** A leitura de "renda" e "estágio" nas falas, no vocabulário do detector de assuntos. */
const ASSUNTO_DO_FUNIL: Record<string, AssuntoDoFunil> = {
  regiao: "regiao",
  estagio: "estagio",
  tipologia: "tipologia",
  renda: "capacidade",
};

function assuntosDoFunil(texto: string): AssuntoDoFunil[] {
  return assuntosDe(texto)
    .map((a) => ASSUNTO_DO_FUNIL[a])
    .filter((a): a is AssuntoDoFunil => Boolean(a));
}

export function estadoDaConversa(params: {
  historico: readonly Fala[];
  mensagemAtual: string;
  dossie?: Pick<
    DossieClienteIA,
    "rendaMensal" | "regiaoInteresse" | "dormitoriosMin" | "orcamentoMin" | "orcamentoMax"
  > | null;
  imovelEmFoco: Empreendimento | null;
  catalogo: readonly Empreendimento[];
}): EstadoDaConversa {
  const { historico, mensagemAtual, dossie } = params;

  const falasCliente = historico.filter((f) => f.remetente === "cliente").map((f) => f.texto);
  const falasBot = historico.filter((f) => f.remetente === "bot").map((f) => f.texto);

  const respondidos = new Set<AssuntoDoFunil>();
  for (const texto of [...falasCliente, mensagemAtual]) {
    for (const a of assuntosDoFunil(texto)) respondidos.add(a);
  }
  // O dossiê é o que a extração já consolidou — vale mais que o regex.
  if (dossie?.regiaoInteresse) respondidos.add("regiao");
  if (dossie?.dormitoriosMin != null) respondidos.add("tipologia");
  if (dossie?.rendaMensal != null || dossie?.orcamentoMin != null || dossie?.orcamentoMax != null) {
    respondidos.add("capacidade");
  }

  const perguntadosAlgumaVez = new Set<AssuntoDoFunil>();
  for (const texto of falasBot) {
    for (const pergunta of perguntasDe(texto)) {
      for (const a of assuntosDoFunil(pergunta)) perguntadosAlgumaVez.add(a);
    }
  }
  const perguntadosNaUltima = new Set<AssuntoDoFunil>();
  const ultimaDoBot = falasBot[falasBot.length - 1] ?? "";
  for (const pergunta of perguntasDe(ultimaDoBot)) {
    for (const a of assuntosDoFunil(pergunta)) perguntadosNaUltima.add(a);
  }

  const convidouVisita = falasBot.some((t) =>
    /\b(visita|visitar|conhecer|decorado|apresentar|te mostr)/i.test(t),
  );

  return {
    respondidos,
    perguntadosNaUltima,
    perguntadosAlgumaVez,
    convidouVisita,
    horariosOferecidos: horariosJaOferecidos(historico).frases.length,
    pedidoEmAberto: dadoPedido({
      mensagem: mensagemAtual,
      imovel: params.imovelEmFoco,
      catalogo: params.catalogo,
    }),
    perguntaRepetida: perguntaIgnorada({ historico, mensagemAtual }),
    falasDoCliente: falasCliente.length + (mensagemAtual.trim() ? 1 : 0),
    capacidadePendente: capacidadeEstaPendente({
      dossie,
      historico: [...historico],
      mensagemAtual,
      catalogo: [...params.catalogo],
    }),
  };
}

/**
 * A próxima jogada, em ordem de prioridade.
 *
 * 1. Ele pediu um dado que temos → entregar. Responder vem antes de
 *    perguntar: é a causa nº 1 da taxonomia (10 de 16 conversas).
 * 2. Ele repetiu uma pergunta que não temos como responder → dizer isso
 *    com honestidade, em vez de desviar pela terceira vez.
 * 3. O próximo assunto do funil que ele ainda não cobriu — nunca o que a IA
 *    acabou de perguntar, nunca o que ele já respondeu. Capacidade só entra
 *    quando o funil já passou por região e tipologia e a conversa não está
 *    no começo (`capacidadeEstaPendente`).
 * 4. O convite para a visita, cedo: assim que a região é conhecida e antes
 *    de o funil terminar. A corretora que converte convida na 5ª–8ª
 *    mensagem, junto com a apresentação — não como prêmio no fim.
 * 5. Funil completo e nenhum horário na mesa → propor horário.
 * 6. Tudo feito, ou tudo já recusado → devolver a escolha a ele. Insistir
 *    numa quarta pergunta seria o loop com outra roupa.
 */
export function planejarJogada(estado: EstadoDaConversa): Jogada {
  if (estado.pedidoEmAberto) return { tipo: "responder_dado", dado: estado.pedidoEmAberto };

  if (estado.perguntaRepetida) {
    return {
      tipo: "responder_honesto",
      pergunta: estado.perguntaRepetida.pergunta,
      vezes: estado.perguntaRepetida.vezes,
    };
  }

  const proximoAssunto = ORDEM_DO_FUNIL.find((a) => {
    if (estado.respondidos.has(a)) return false;
    if (estado.perguntadosNaUltima.has(a)) return false;
    if (a === "capacidade") return estado.capacidadePendente;
    return true;
  });

  // O convite entra cedo, mas não antes de saber a região: convidar para
  // "conhecer" sem saber onde ele procura é convite para lugar nenhum.
  if (!estado.convidouVisita && estado.respondidos.has("regiao") && estado.falasDoCliente >= 2) {
    return { tipo: "convidar_visita" };
  }

  if (proximoAssunto) return { tipo: "perguntar", assunto: proximoAssunto };

  const funilCompleto = ORDEM_DO_FUNIL.every((a) => estado.respondidos.has(a));
  if (funilCompleto && estado.horariosOferecidos < 2) {
    return { tipo: "propor_horario", jaOfereceu: estado.horariosOferecidos };
  }

  return { tipo: "devolver_escolha" };
}

const PERGUNTA_DO_ASSUNTO: Record<AssuntoDoFunil, string> = {
  regiao: "em qual região de Barueri ele procura",
  estagio: "se ele quer pronto para morar ou na planta",
  tipologia: "quantos dormitórios ele precisa",
  capacidade:
    "o que cabe no bolso — pela escada, do menos invasivo para o mais: a FAIXA que ele tem em mente; se não vier, se a compra é sozinho ou em conjunto; depois a profissão; e só por último a renda, com a razão junto",
};

/**
 * O bloco que vai no TOPO do prompt. Curto e único: é a tarefa da mensagem,
 * e é a única instrução que precisa ganhar de todas as outras.
 */
export function blocoDaJogada(jogada: Jogada, contexto: { nomeDoFoco: string | null }): string {
  const cabecalho = "SUA ÚNICA TAREFA NESTA MENSAGEM";

  switch (jogada.tipo) {
    case "responder_dado": {
      const sobre = jogada.dado.imovel ? `O ${jogada.dado.imovel}` : "";
      const frase = sobre ? `${sobre} ${jogada.dado.resposta}.` : `${maiuscula(jogada.dado.resposta)}.`;
      return [
        `${cabecalho}: responder o que ele perguntou, com este dado, ANTES de qualquer pergunta sua.`,
        `Diga: "${frase}" (ajuste a redação; NUNCA o número nem o dado).`,
        "Depois do dado, no máximo UMA pergunta curta, ou o convite para a visita.",
      ].join("\n");
    }
    case "responder_honesto":
      return [
        `${cabecalho}: ele já perguntou "${jogada.pergunta}" ${jogada.vezes} vezes e você não respondeu.`,
        "Responda DIRETO com o que você tem. Se não tem o dado, diga que não tem e o que vai fazer (\"confirmo com o corretor e te trago\").",
        "Sem repetir o desvio anterior, sem devolver pergunta de qualificação nesta mensagem.",
      ].join("\n");
    case "perguntar":
      return [
        `${cabecalho}: fazer UMA pergunta — ${PERGUNTA_DO_ASSUNTO[jogada.assunto]}.`,
        "Antes dela, uma frase curta reagindo ao que ele disse. Nada mais: uma pergunta por mensagem.",
      ].join("\n");
    case "convidar_visita":
      return [
        `${cabecalho}: convidar para conhecer${contexto.nomeDoFoco ? ` o ${contexto.nomeDoFoco}` : " o decorado"} — o CONVITE, não o horário.`,
        "Uma frase de convite (\"quer conhecer o decorado?\"), junto com o link da página quando fizer sentido. O horário concreto fica para depois.",
      ].join("\n");
    case "propor_horario":
      return [
        `${cabecalho}: propor um horário CONCRETO de visita.`,
        "Se houver HORÁRIOS REAIS abaixo, ofereça no máximo dois deles. Se não houver, pergunte qual dia da semana fica melhor e se prefere manhã ou tarde.",
        jogada.jaOfereceu > 0
          ? "Você já ofereceu horário antes e ele não fechou: ofereça OUTROS, nunca os mesmos."
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "devolver_escolha":
      return [
        `${cabecalho}: devolver a escolha a ele.`,
        "Você já perguntou o que tinha para perguntar e já ofereceu o que tinha para oferecer. Em UMA frase, pergunte o que ele prefere fazer agora — sem nova pergunta de qualificação, sem repetir oferta.",
      ].join("\n");
  }
}

function maiuscula(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

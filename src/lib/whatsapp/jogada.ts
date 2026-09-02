import type { DossieClienteIA } from "./types";
import type { Empreendimento } from "@/lib/types";
import { assuntosDe, perguntasDe } from "./metricasConversa";
import { dadoPedido, formatarReais, type DadoPedido } from "./dadoPedido";
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
  | { tipo: "confirmar_visita"; oQueEleDisse: string }
  | { tipo: "tratar_objecao"; oQueEleDisse: string }
  | { tipo: "indicar_alternativa"; slug: string; nome: string; piso: number | null; emVezDe: string | null }
  | { tipo: "deixar_porta_aberta"; oQueEleDisse: string }
  | { tipo: "encerrar_confirmado" }
  | { tipo: "devolver_escolha" };

import type { Fala } from "./rajada";

export interface EstadoDaConversa {
  /** Assuntos do funil que o cliente já cobriu (na fala ou no dossiê). */
  respondidos: Set<AssuntoDoFunil>;
  /** Assuntos que a IA perguntou na ÚLTIMA mensagem dela. */
  perguntadosNaUltima: Set<AssuntoDoFunil>;
  /** Assuntos que a IA já perguntou em qualquer momento. */
  perguntadosAlgumaVez: Set<AssuntoDoFunil>;
  /** Quantas vezes cada assunto foi perguntado — a repergunta é permitida UMA vez. */
  vezesPerguntado: Map<AssuntoDoFunil, number>;
  /** O cliente pediu um HORÁRIO ("que horas?", "quando dá?"). */
  pediuHorario: boolean;
  /** Objeção de PREÇO ("tá caro", "passa do que eu queria"). */
  objetouPreco: boolean;
  /** Pediu ALTERNATIVA ("tem algo mais em conta?", "outra opção?"). */
  pediuAlternativa: boolean;
  /** Saída suave ("vou pensar", "vou ver com minha esposa"). */
  saidaSuave: boolean;
  /** Quantas falas SEGUIDAS do cliente foram objeção de preço (contando a atual). */
  objecoesSeguidas: number;
  /** A IA JÁ confirmou uma visita nesta conversa: o funil acabou. */
  visitaConfirmada: boolean;
  /** Perguntou algo que NÃO temos como responder (desconto, negociar, preço final). */
  perguntaSemDado: string | null;
  /** A alternativa mais em conta do catálogo, fora do foco. */
  alternativa: { slug: string; nome: string; piso: number | null } | null;
  nomeDoFoco: string | null;
  convidouVisita: boolean;
  horariosOferecidos: number;
  pedidoEmAberto: DadoPedido | null;
  perguntaRepetida: PerguntaIgnorada | null;
  falasDoCliente: number;
  capacidadePendente: boolean;
  /** A IA ofereceu horário na última fala e o cliente acabou de ACEITAR. */
  aceitouHorario: boolean;
  /** A fala dele, para o bloco confirmar EXATAMENTE o que ele escolheu. */
  oQueEleDisse: string;
}

/** A leitura de "renda" e "estágio" nas falas, no vocabulário do detector de assuntos. */
const ASSUNTO_DO_FUNIL: Record<string, AssuntoDoFunil> = {
  regiao: "regiao",
  estagio: "estagio",
  tipologia: "tipologia",
  renda: "capacidade",
};

/**
 * "Planta" é ambígua — e o detector de métricas não precisa desfazer isso,
 * o planner precisa.
 *
 * "pode ser na planta" é ESTÁGIO (imóvel em obra); "manda a planta" é
 * pedido de MÍDIA. Nenhum dos dois diz quantos dormitórios a pessoa quer.
 * O regex de tipologia das métricas inclui "planta" e, no trace
 * cooperativo, "pode ser na planta" marcou tipologia como respondida — o
 * planner pulou a pergunta de dormitórios e caiu em `devolver_escolha` no
 * terceiro turno de uma conversa que ia bem.
 */
/**
 * Como se aceita um horário no WhatsApp. Curto de propósito: "não pode"
 * contém "pode", então a negação é checada ANTES e vence.
 */
const ACEITE =
  /\b(pode ser|fechado|fechou|combinado|perfeito|otimo|beleza|bora|vamos|topo|confirmo|confirmado|pode marcar|marca|esse (horario|dia)|esse mesmo|ta bom|tá bom|ok|sim|então|entao)\b/;
const NEGACAO = /\b(nao|não|nem|impossivel|impossível|não da|nao da|não consigo|nao consigo|outro (dia|horario)|outra hora)\b/;

const PEDIDO_DE_HORARIO =
  /\b(que horas|qual horario|qual o horario|que dia|quando (da|dá|posso|pode|e possivel|é possível|voces|vocês)|tem horario|horario disponivel)\b/;

/**
 * As três situações que o trace de OBJEÇÃO mostrou o planner ignorar — e
 * que a taxonomia de falhas já apontava: "não ofereceu alternativas" está
 * em 6 das 16 conversas.
 *
 * Detecção conservadora: cada regex casa o que o cliente ESCREVE nessas
 * horas, não o que ele poderia querer dizer. Errar para "não detectou"
 * custa uma jogada genérica; errar para "detectou" trataria como objeção
 * uma frase que era pergunta.
 */
const OBJECAO_DE_PRECO =
  /\b(ta caro|tá caro|caro demais|muito caro|salgado|acima do (meu )?(orcamento|orçamento)|passa do que|passa do meu|nao cabe|não cabe|fora do (meu )?(orcamento|orçamento|bolso))\b/;
const PEDIDO_DE_ALTERNATIVA =
  /\b(mais em conta|mais barato|mais barata|outra opcao|outra opção|outras opcoes|outras opções|algo (mais )?(barato|em conta|acessivel|acessível)|tem outro|outro imovel|outro imóvel|alternativa)\b/;
const SAIDA_SUAVE =
  /\b(vou pensar|preciso pensar|vou ver com|vou conversar com|vou falar com|depois eu (vejo|falo|te falo)|te aviso|qualquer coisa eu (chamo|falo)|por enquanto nao|por enquanto não|mais pra frente|outra hora)\b/;

/**
 * Objeções de preço em sequência, contando a fala atual.
 *
 * Para de contar na primeira fala do cliente que NÃO é objeção: o que
 * interessa é a insistência recente, não o histórico inteiro.
 */
function contarObjecoesSeguidas(falasCliente: readonly string[], atualNormalizada: string): number {
  if (!OBJECAO_DE_PRECO.test(atualNormalizada)) return 0;
  let n = 1;
  for (let i = falasCliente.length - 1; i >= 0; i--) {
    if (OBJECAO_DE_PRECO.test(normalizar(falasCliente[i]))) n++;
    else break;
  }
  return n;
}

/**
 * A IA já confirmou a visita: "sábado às 9h está reservado".
 *
 * Sonda do caminho feliz com API: a conversão aconteceu no turno 3, e o
 * funil CONTINUOU ("pronto ou na planta?"). O cliente respondeu "não
 * perguntei isso", depois "só quero ver o apartamento", e a conversa que
 * antes encerrava no turno 8 bateu o teto de 12. Qualificar depois de
 * fechar é desfazer o que a conversa conquistou.
 */
const CONFIRMACAO =
  /\b(reservad[oa]|confirmad[oa]|combinad[oa]|anotad[oa]|marcad[oa]|fechad[oa]|esta agendad[oa]|está agendad[oa])\b/;

/**
 * O que NÃO temos como responder — e merece resposta honesta na PRIMEIRA
 * vez, não só na repetição.
 *
 * Sonda adversarial com API: "tem como negociar? quero saber do desconto"
 * recebeu "em qual região você procura?". `responder_honesto` só disparava
 * com a pergunta repetida (vezes ≥ 2); antes disso o planner caía no
 * funil, e quem pergunta de desconto e ouve "região?" entende que não foi
 * ouvido.
 */
const SEM_DADO =
  /\b(desconto|negociar|negocia|abatimento|valor exato|preco final|preço final|quanto fica no final|valor final|condicao especial|condição especial)\b/;

/** A opção mais em conta do catálogo que NÃO é o imóvel em foco. */
function alternativaMaisEmConta(
  catalogo: readonly Empreendimento[],
  foco: Empreendimento | null,
): { slug: string; nome: string; piso: number | null } | null {
  const candidatos = catalogo
    .filter((e) => e.slug !== foco?.slug && typeof e.precoAPartir === "number" && e.precoAPartir > 0)
    .sort((a, b) => (a.precoAPartir ?? 0) - (b.precoAPartir ?? 0));
  const melhor = candidatos[0];
  return melhor ? { slug: melhor.slug, nome: melhor.nome, piso: melhor.precoAPartir } : null;
}

const TIPOLOGIA_DE_VERDADE = /\b(dormitorio|dormitorios|quarto|quartos|suite|suites|vaga|vagas|metragem|m2|metros)\b/;

/**
 * A pergunta de capacidade, como a ESCADA da casa a faz: faixa → sozinho ou
 * em conjunto → profissão → renda. O regex de métricas só conhece "renda /
 * financiamento"; a primeira e mais comum forma ("qual faixa de valor você
 * tem em mente?") não casava, e o planner repetia a pergunta que a IA
 * acabara de fazer. Flagrado no trace cooperativo, turnos 4 e 5.
 */
const PERGUNTA_DE_CAPACIDADE =
  /\b(faixa|valor em mente|orcamento|pretende investir|quanto (voce )?pretende|sozinho|em conjunto|profissao|trabalha com|renda)\b/;

/**
 * Como o cliente responde "pronto ou na planta?" de verdade: uma palavra.
 * O regex de métricas exige a locução inteira; aqui vale a palavra.
 */
const RESPOSTA_DE_ESTAGIO = /\b(pronto|prontos|planta|lancamento|obra|construcao|tanto faz|qualquer um|indiferente|os dois|ambos)\b/;

function assuntosDoFunil(texto: string): AssuntoDoFunil[] {
  const n = normalizar(texto);
  const achados = new Set<AssuntoDoFunil>(
    assuntosDe(texto)
      .map((a) => ASSUNTO_DO_FUNIL[a])
      .filter((a): a is AssuntoDoFunil => Boolean(a)),
  );
  // Tipologia só com palavra de tipologia de verdade — "planta" não conta.
  if (achados.has("tipologia") && !TIPOLOGIA_DE_VERDADE.test(n)) achados.delete("tipologia");
  if (PERGUNTA_DE_CAPACIDADE.test(n)) achados.add("capacidade");
  if (RESPOSTA_DE_ESTAGIO.test(n)) achados.add("estagio");
  return [...achados];
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Dado que a IA JÁ ENTREGOU não é pedido em aberto.
 *
 * Flagrado na sonda da v32, turno 11: "mas e o valor exato?" casa no regex
 * de preço, `responder_dado` tem prioridade 1, e ela repete "começa em
 * R$ 249.000" que já tinha dito no turno 1. Dado repetido não é resposta —
 * é o loop com a roupa de resposta. E como esta checagem vinha antes de
 * tudo, a regra da terceira insistência nunca chegava a rodar.
 *
 * A comparação é pelo NÚMERO (ou pela resposta inteira quando não há
 * número): "R$ 249.000" dito como "começa em R$ 249.000" ou "a partir de
 * R$ 249.000" é o mesmo dado entregue.
 */
function aindaNaoDado(pedido: DadoPedido | null, falasBot: readonly string[]): DadoPedido | null {
  if (!pedido) return null;
  const numero = pedido.resposta.match(/R\$\s?[\d.]+|\d+(?:\s*a\s*\d+)?\s*m²/)?.[0];
  const marca = numero ?? pedido.resposta;
  const jaDito = falasBot.some((t) => t.includes(marca));
  return jaDito ? null : pedido;
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
  /*
   * A resposta à pergunta do turno anterior CONTA, mesmo quando o regex não
   * a reconhece.
   *
   * A medição da v32 (16 personas × 2 rodadas) deu REGRESSÃO: "conversas em
   * que a IA repetiu" dobrou, 6,5 → 14, e a pergunta repetida era uma só —
   * "pronto para morar ou na planta?", ~37 vezes. O regex de estágio exige
   * "pronto para morar" / "na planta"; cliente real responde "pronto",
   * "planta", "tanto faz". O planner não reconhecia, achava a pergunta em
   * aberto, e a repergunta permitida transformava cada falha de leitura em
   * repetição garantida. O modelo sozinho (v31) entendia "pronto" como
   * resposta — o planner era mais burro que ele nessa leitura.
   *
   * A regra estrutural: se a IA perguntou X no turno anterior e o cliente
   * respondeu QUALQUER COISA que não seja uma pergunta, X foi respondido.
   * A repergunta só cabe quando ele perguntou outra coisa em vez de
   * responder — e nesse caso o planner já prioriza responder a dele.
   */
  const ultimaDoBotAntes = falasBot[falasBot.length - 1] ?? "";
  const clienteNaoPerguntou = !mensagemAtual.includes("?");
  if (clienteNaoPerguntou) {
    for (const pergunta of perguntasDe(ultimaDoBotAntes)) {
      for (const a of assuntosDoFunil(pergunta)) respondidos.add(a);
    }
  }

  // O dossiê é o que a extração já consolidou — vale mais que o regex.
  if (dossie?.regiaoInteresse) respondidos.add("regiao");
  if (dossie?.dormitoriosMin != null) respondidos.add("tipologia");
  if (dossie?.rendaMensal != null || dossie?.orcamentoMin != null || dossie?.orcamentoMax != null) {
    respondidos.add("capacidade");
  }

  const perguntadosAlgumaVez = new Set<AssuntoDoFunil>();
  const vezesPerguntado = new Map<AssuntoDoFunil, number>();
  for (const texto of falasBot) {
    for (const pergunta of perguntasDe(texto)) {
      for (const a of assuntosDoFunil(pergunta)) {
        perguntadosAlgumaVez.add(a);
        vezesPerguntado.set(a, (vezesPerguntado.get(a) ?? 0) + 1);
      }
    }
  }
  const perguntadosNaUltima = new Set<AssuntoDoFunil>();
  const ultimaDoBot = falasBot[falasBot.length - 1] ?? "";
  for (const pergunta of perguntasDe(ultimaDoBot)) {
    for (const a of assuntosDoFunil(pergunta)) perguntadosNaUltima.add(a);
  }

  /*
   * ACEITE: a última fala do bot ofereceu horário E a fala do cliente traz
   * marcador de aceite. Flagrado no trace cooperativo: o cliente disse
   * "sábado de manhã pode ser" e o planner devolveu `propor_horario` de
   * novo — o bloco mandaria propor OUTRO horário no exato momento em que a
   * pessoa aceitou o primeiro. É o momento da conversão; errar aqui é
   * perder a visita que a conversa inteira construiu.
   *
   * Determinístico e conservador: exige as DUAS metades. Aceite sem oferta
   * anterior ("pode ser") não é aceite de horário; oferta sem aceite é a
   * jogada anterior ainda em aberto.
   */
  const ultimaDoBotOfereceu =
    ultimaDoBot.length > 0 &&
    horariosJaOferecidos([{ remetente: "bot", texto: ultimaDoBot }]).frases.length > 0;
  const nAtual = normalizar(mensagemAtual);
  const aceitouHorario = ultimaDoBotOfereceu && !NEGACAO.test(nAtual) && ACEITE.test(nAtual);

  const convidouVisita = falasBot.some((t) =>
    /\b(visita|visitar|conhecer|decorado|apresentar|te mostr)/i.test(t),
  );

  return {
    respondidos,
    perguntadosNaUltima,
    perguntadosAlgumaVez,
    convidouVisita,
    /*
     * Conta TURNOS em que a IA ofereceu horário, não frases distintas.
     * `horariosJaOferecidos` deduplica sentenças iguais (é o certo para o
     * bloco "não repita ESTES"), mas como porta do planner isso travava:
     * oferta repetida com o mesmo texto contava uma vez, `< 2` nunca
     * fechava, e `propor_horario` saía para sempre. Flagrado no trace sem
     * API: turnos 4 a 8 iguais, com "já ofereceu 1" congelado.
     */
    horariosOferecidos: falasBot.filter(
      (t) => horariosJaOferecidos([{ remetente: "bot", texto: t }]).frases.length > 0,
    ).length,
    pedidoEmAberto: aindaNaoDado(
      dadoPedido({ mensagem: mensagemAtual, imovel: params.imovelEmFoco, catalogo: params.catalogo }),
      falasBot,
    ),
    perguntaRepetida: perguntaIgnorada({ historico, mensagemAtual }),
    falasDoCliente: falasCliente.length + (mensagemAtual.trim() ? 1 : 0),
    aceitouHorario,
    oQueEleDisse: mensagemAtual.trim(),
    vezesPerguntado,
    /*
     * "Que horas?" / "quando dá?" é pedido de HORÁRIO, e no caminho feliz
     * com API ele foi ignorado no turno 2 (o planner escolheu o convite) e o
     * cliente teve de repetir. Quem pergunta a hora já aceitou visitar — a
     * jogada é propor o horário, não convidar.
     */
    pediuHorario: PEDIDO_DE_HORARIO.test(nAtual),
    objetouPreco: OBJECAO_DE_PRECO.test(nAtual),
    objecoesSeguidas: contarObjecoesSeguidas(falasCliente, nAtual),
    pediuAlternativa: PEDIDO_DE_ALTERNATIVA.test(nAtual),
    saidaSuave: SAIDA_SUAVE.test(nAtual),
    visitaConfirmada: falasBot.some((t) => CONFIRMACAO.test(normalizar(t))),
    perguntaSemDado: SEM_DADO.test(nAtual) ? mensagemAtual.trim() : null,
    alternativa: alternativaMaisEmConta(params.catalogo, params.imovelEmFoco),
    nomeDoFoco: params.imovelEmFoco?.nome ?? null,
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
  // O aceite vem ANTES de tudo: é o momento da conversão, e qualquer outra
  // jogada aqui (até entregar um dado) adiaria a confirmação em um turno.
  if (estado.aceitouHorario) return { tipo: "confirmar_visita", oQueEleDisse: estado.oQueEleDisse };

  if (estado.pedidoEmAberto) return { tipo: "responder_dado", dado: estado.pedidoEmAberto };

  /*
   * Visita CONFIRMADA: o funil acabou. Qualquer fala dele daqui em diante
   * recebe uma resposta curta e a porta aberta — nada de qualificar quem
   * já marcou.
   */
  if (estado.visitaConfirmada) return { tipo: "encerrar_confirmado" };

  /*
   * Perguntou algo que não temos (desconto, negociar, preço final) pela
   * PRIMEIRA vez: honestidade na hora. Na repetição, a regra da insistência
   * abaixo assume e muda a jogada.
   */
  if (estado.perguntaSemDado && !estado.perguntaRepetida) {
    return { tipo: "responder_honesto", pergunta: estado.perguntaSemDado, vezes: 1 };
  }

  /*
   * Pedido de ALTERNATIVA vence a objeção (é mais específico), e a objeção
   * vence a saída suave. Os três vêm antes do funil: quem diz "tá caro" e
   * recebe "pronto ou na planta?" de volta entende que não foi ouvido.
   */
  if (estado.pediuAlternativa && estado.alternativa) {
    return {
      tipo: "indicar_alternativa",
      ...estado.alternativa,
      emVezDe: estado.nomeDoFoco,
    };
  }
  if (estado.objetouPreco) {
    /*
     * A SEGUNDA objeção seguida já é pedido de alternativa, mesmo sem ele
     * dizer "tem algo mais em conta?". Tratar a objeção duas vezes com a
     * mesma jogada é o loop com outra roupa — e a régua da casa para
     * objeção de preço é justamente "não defenda o valor; ofereça outro
     * caminho". Só cai na objeção de novo quando não há alternativa.
     */
    if (estado.objecoesSeguidas >= 2 && estado.alternativa) {
      return { tipo: "indicar_alternativa", ...estado.alternativa, emVezDe: estado.nomeDoFoco };
    }
    return { tipo: "tratar_objecao", oQueEleDisse: estado.oQueEleDisse };
  }
  if (estado.saidaSuave) return { tipo: "deixar_porta_aberta", oQueEleDisse: estado.oQueEleDisse };

  // Pediu a hora: já aceitou visitar. Propor é responder.
  if (estado.pediuHorario && estado.horariosOferecidos < 2) {
    return { tipo: "propor_horario", jaOfereceu: estado.horariosOferecidos };
  }

  if (estado.perguntaRepetida) {
    const { pergunta, vezes } = estado.perguntaRepetida;

    /*
     * Na SEGUNDA vez, responde com honestidade. Da TERCEIRA em diante, a
     * jogada MUDA — porque responder de novo é o loop com outra roupa.
     *
     * Flagrado pela sonda da v32 antes mesmo de ela terminar: o guardrail
     * bloqueou três vezes a mesma frase ("o valor exato depende do andar…")
     * nos turnos 4, 5 e 7. A causa era esta checagem, que vinha antes de
     * tudo em TODO turno, sem memória de já ter respondido. Quem já ouviu a
     * resposta honesta e pergunta de novo não quer a resposta de novo —
     * quer o próximo passo. Na regra da casa, a pergunta de preço é o
     * convite para a visita: é lá que os números fecham.
     */
    if (vezes <= 2) return { tipo: "responder_honesto", pergunta, vezes };

    if (estado.horariosOferecidos < 2) {
      return { tipo: "propor_horario", jaOfereceu: estado.horariosOferecidos };
    }
    return { tipo: "devolver_escolha" };
  }

  const proximoAssunto = ORDEM_DO_FUNIL.find((a) => {
    if (estado.respondidos.has(a)) return false;
    /*
     * "Ignorou a pergunta" e "respondeu outra coisa" são diferentes. No
     * trace cooperativo, "sim, quero conhecer" respondia ao CONVITE, não à
     * pergunta de capacidade do turno anterior — e a regra "nunca repita a
     * pergunta da última mensagem" derrubava a conversa em
     * `devolver_escolha`. A repergunta é permitida UMA vez; na segunda, o
     * assunto sai do caminho (ele não quer responder, e insistir afasta).
     */
    if (estado.perguntadosNaUltima.has(a) && (estado.vezesPerguntado.get(a) ?? 0) >= 2) return false;
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
    case "confirmar_visita":
      return [
        `${cabecalho}: CONFIRMAR a visita que ele acabou de aceitar.`,
        `Ele disse: "${jogada.oQueEleDisse}". Em UMA frase, confirme o dia e o horário exatos que ele escolheu, e diga o que vem a seguir (o corretor confirma o endereço / te chamo na véspera).`,
        "Preencha \"visitaProposta\" com a data da tabela CALENDÁRIO e \"confirmadaPeloCliente\": true. Nenhuma pergunta nova, nenhum outro horário — ele já escolheu.",
      ].join("\n");
    case "tratar_objecao":
      return [
        `${cabecalho}: tratar a OBJEÇÃO de preço — ele disse "${jogada.oQueEleDisse}".`,
        "Nunca defenda o valor de frente e nunca cite cifra para rebater. Em UMA frase, reconheça; depois descubra a referência dele (\"o que você viu por esse valor?\") OU desloque para condição (\"entrada parcelada, financiamento pela construtora — na visita o corretor monta o fluxo\"). Uma pergunta só.",
        "Se o catálogo tiver uma opção mais em conta, você PODE mencioná-la pelo nome, sem cifra além do piso da ficha.",
      ].join("\n");
    case "indicar_alternativa":
      return [
        `${cabecalho}: ele pediu uma opção mais em conta${jogada.emVezDe ? ` que o ${jogada.emVezDe}` : ""}. INDIQUE: ${jogada.nome}.`,
        jogada.piso
          ? `Diga o piso da ficha (\"a partir de ${formatarReais(jogada.piso)}\") e UMA razão de encaixe (região, tipologia). Nada de lista: um imóvel, com o link da página.`
          : "Apresente com UMA razão de encaixe (região, tipologia) e o link da página. Sem cifra: este não tem piso cadastrado.",
        "Não repita o imóvel que ele acabou de achar caro.",
      ].join("\n");
    case "deixar_porta_aberta":
      return [
        `${cabecalho}: ele sinalizou que vai pensar / decidir com alguém — "${jogada.oQueEleDisse}".`,
        "Respeite. UMA frase: deixe a porta aberta e ofereça o que ajuda a decidir junto (o link da página ou as fotos, para mostrar a quem ele citou). NENHUMA pergunta de qualificação, NENHUM horário. Termine sem cobrar resposta.",
      ].join("\n");
    case "encerrar_confirmado":
      return [
        `${cabecalho}: a visita JÁ ESTÁ CONFIRMADA. Não qualifique mais.`,
        "Responda o que ele disse em UMA frase curta (se perguntou endereço/horário, repita o combinado). Nenhuma pergunta de região, estágio, tipologia ou renda — isso acabou. Feche com \"qualquer dúvida até lá, me chama\".",
      ].join("\n");
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

/**
 * As medidas que só existem quando se olha a CONVERSA inteira.
 *
 * O eval de resposta — 36 casos, cada um um histórico congelado mais uma
 * pergunta — não enxerga nenhum defeito deste arquivo, por construção. Ele
 * deu 95,8/100 num agente que desfilava imóveis, reenviava as mesmas fotos,
 * repetia pergunta já respondida e respondia só o último balão da rajada.
 * Todos esses defeitos moram entre turnos, não dentro de uma resposta.
 *
 * Tudo aqui é FUNÇÃO PURA e determinística — nenhuma chamada de modelo.
 * É a mesma regra que vale para os guardrails e para `vozHumana`: instrução
 * de prompt é probabilística e falha justo na resposta que importa; função
 * determinística vale sempre e é testável. O juiz LLM opina sobre o todo
 * depois, e a opinião dele nunca substitui estas contas.
 *
 * Mora em `src/lib/whatsapp` e não em `scripts/` porque a F1 do roadmap usa
 * as mesmas funções na fila de revisão do painel: "o cliente repetiu a
 * pergunta" é métrica de eval E sinal de rótulo automático.
 */

/** Um turno: o que o cliente disse e o que a IA respondeu. */
export type TurnoRegistrado = {
  /** Os balões que o cliente mandou de uma vez. Vazio no follow-up. */
  cliente: string[];
  /** O texto completo da resposta, antes de ser quebrado em balões. */
  bot: string;
  /** URLs dos anexos que saíram neste turno. */
  anexos?: string[];
  /** Modelo que respondeu — é o que denuncia troca de voz. */
  modelo?: string | null;
  /** A IA marcou proposta de visita neste turno? */
  sugeriuVisita?: boolean;
};

/**
 * A faixa de tamanho da casa, medida em conversas reais de uma corretora
 * que fecha negócio: 93 mensagens dela, média de 47 CARACTERES. Os limites
 * do chunking são 120/240 justamente por isso.
 */
export const TAMANHO_CONFORTAVEL = 240;

/**
 * Até que turno a visita precisa ter sido oferecida.
 *
 * Nas duas conversas reais que viraram visita, o convite veio na 5ª e na 8ª
 * mensagem — cedo, junto da apresentação, não como prêmio no fim da
 * qualificação.
 */
export const TURNO_LIMITE_DA_VISITA = 8;

/** Quantos turnos seguidos sem assunto novo já contam como andar em círculo. */
export const TURNOS_SEM_NOVIDADE_TOLERADOS = 3;

const ACENTOS = /[̀-ͯ]/g;

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(ACENTOS, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palavras que não distinguem uma frase de outra. Sem cortá-las, duas
 * perguntas completamente diferentes compartilham "voce", "para", "qual" e
 * passam do limiar de semelhança.
 */
const VAZIAS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na",
  "nos", "nas", "um", "uma", "para", "por", "com", "que", "se", "eu", "voce",
  "vc", "me", "te", "ja", "ai", "la", "ou", "mas", "sua", "seu", "e", "ao",
]);

function palavrasUteis(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(" ")
      .filter((p) => p.length > 2 && !VAZIAS.has(p)),
  );
}

/**
 * Semelhança entre duas frases, de 0 a 1 (Jaccard sobre palavras úteis).
 *
 * Escolhida em vez de distância de edição porque *"em que região você
 * procura?"* e *"em que prazo você precisa?"* têm quase todas as letras em
 * comum e são perguntas diferentes — o que interessa é a palavra que
 * distingue, não o texto.
 *
 * **O que ela NÃO faz, e é decisão consciente: paráfrase.** *"Qual sua renda
 * mensal?"* e *"Quanto vocês recebem por mês?"* são a mesma pergunta e ficam
 * abaixo do limiar. Pega-se repetição quase literal, que é a forma como a
 * repetição de fato acontece — modelo que repergunta costuma repetir a
 * própria frase.
 *
 * O erro é assimétrico de propósito: deixar passar uma repetição custa uma
 * medida a menos; acusar repetição que não houve manda alguém consertar um
 * comportamento correto. Este projeto já tem QUATRO critérios que reprovaram
 * o comportamento certo — nenhum deles errou por ser conservador demais.
 */
export function semelhanca(a: string, b: string): number {
  const pa = palavrasUteis(a);
  const pb = palavrasUteis(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  return comuns / (pa.size + pb.size - comuns);
}

const SEMELHANTES = 0.6;

/**
 * As perguntas de um texto — as frases que terminam em interrogação.
 *
 * O corte é no fim de QUALQUER frase, não só depois do "?". Cortando só na
 * interrogação, *"Tenho sim. Quer ver a planta?"* virava uma pergunta só
 * com a afirmação colada — e a afirmação traz palavras que empurram a
 * semelhança para cima, inventando repetição onde não houve.
 */
export function perguntasDe(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+|\n+/)
    .map((f) => f.trim())
    .filter((f) => f.endsWith("?") && palavrasUteis(f).size > 0);
}

/**
 * Os assuntos de qualificação, na ordem que a corretora real usa: região →
 * pronto ou planta → tipologia → RENDA → visita.
 *
 * Servem para responder "a conversa ANDOU?" sem pedir opinião a modelo
 * nenhum: se três turnos passam sem nenhum assunto novo e sem convite, ela
 * está girando.
 */
const ASSUNTOS: { nome: string; termos: RegExp }[] = [
  { nome: "regiao", termos: /\b(regiao|bairro|cidade|onde|barueri|alphaville|localiza)/ },
  { nome: "estagio", termos: /\b(pronto para morar|na planta|lancamento|entrega|obra|construcao)/ },
  { nome: "tipologia", termos: /\b(dormitorio|quarto|suite|metragem|m2|metros|vaga|planta)/ },
  { nome: "renda", termos: /\b(renda|financiamento|financia|entrada|banco|aprovado)/ },
  { nome: "visita", termos: /\b(visita|visitar|conhecer|decorado|agendar|marcar)/ },
  { nome: "perfil", termos: /\b(filho|crianca|pet|familia|morar|investir|investimento)/ },
];

function assuntosDe(texto: string): string[] {
  const n = normalizar(texto);
  return ASSUNTOS.filter((a) => a.termos.test(n)).map((a) => a.nome);
}

/**
 * A IA ofereceu visita. O sinal do próprio agente vem primeiro; o texto é
 * reserva, porque o critério antigo do eval exigia a palavra "visita" e
 * reprovava *"podemos ver durante a semana então, prefere manhã ou
 * tarde?"* — que é o padrão exato de quem converte.
 */
function ofereceuVisita(turno: TurnoRegistrado): boolean {
  if (turno.sugeriuVisita) return true;
  const n = normalizar(turno.bot);
  const convida = /\b(visita|visitar|conhecer|decorado|plantao|apresentar)/.test(n);
  const propoeHorario = /\b(manha|tarde|sabado|domingo|amanha|semana|horario|que dia|as \d{1,2}h?)/.test(n);
  return convida || (propoeHorario && turno.bot.includes("?"));
}

export type MedidaDaConversa = {
  turnos: number;
  /** Em que turno (1-based) a visita foi oferecida. `null` = nunca. */
  turnoDaOfertaDeVisita: number | null;
  /** URLs que saíram mais de uma vez. */
  midiasRepetidas: string[];
  /** Perguntas que a IA fez duas vezes, na forma da segunda ocorrência. */
  perguntasRepetidasPelaIa: string[];
  /** Perguntas que o CLIENTE precisou refazer — sinal de que ela não respondeu. */
  perguntasReaparecidas: string[];
  /** Respostas quase idênticas a uma anterior. */
  respostasRepetidas: number;
  /** Maior sequência de turnos sem assunto novo e sem convite. */
  maiorSequenciaSemNovidade: number;
  assuntosCobertos: string[];
  /** Modelos distintos que responderam. Mais de um = a voz mudou. */
  modelos: string[];
  mediaDeCaracteres: number;
  maiorMensagem: number;
  /** O que reprova, em linguagem de quem lê o relatório. */
  reprovacoes: string[];
};

export function medirConversa(
  turnos: TurnoRegistrado[],
  /**
   * A conversa chegou ao fim por conta própria?
   *
   * `false` quando ela morreu por falha do EVAL — cliente simulado sem cota,
   * provedor fora. Aí não dá para cobrar o que ainda ia acontecer: uma
   * conversa de um turno reprovada por "nunca ofereceu visita" acusa o
   * agente de algo que ele não teve chance de fazer, que é o defeito de
   * eval mais repetido deste projeto.
   */
  opcoes: { conversaCompleta?: boolean } = {},
): MedidaDaConversa {
  const reprovacoes: string[] = [];
  const completa = opcoes.conversaCompleta ?? true;

  // ---- visita: quando foi oferecida
  let turnoDaOferta: number | null = null;
  for (let i = 0; i < turnos.length; i++) {
    if (ofereceuVisita(turnos[i])) {
      turnoDaOferta = i + 1;
      break;
    }
  }
  if (turnoDaOferta === null) {
    // Só cobra o convite de quem teve turnos para dá-lo.
    if (completa && turnos.length >= 3) reprovacoes.push("nunca ofereceu visita");
  } else if (turnoDaOferta > TURNO_LIMITE_DA_VISITA) {
    reprovacoes.push(`ofereceu visita só no turno ${turnoDaOferta}`);
  }

  // ---- mídia repetida
  const vistas = new Set<string>();
  const midiasRepetidas: string[] = [];
  for (const t of turnos) {
    for (const url of t.anexos ?? []) {
      if (vistas.has(url)) {
        if (!midiasRepetidas.includes(url)) midiasRepetidas.push(url);
      } else {
        vistas.add(url);
      }
    }
  }
  if (midiasRepetidas.length > 0) {
    reprovacoes.push(`reenviou ${midiasRepetidas.length} mídia(s) que o cliente já viu`);
  }

  // ---- a IA repergunta o que já perguntou
  const perguntasDaIa: string[] = [];
  const perguntasRepetidasPelaIa: string[] = [];
  for (const t of turnos) {
    for (const p of perguntasDe(t.bot)) {
      if (perguntasDaIa.some((anterior) => semelhanca(anterior, p) >= SEMELHANTES)) {
        perguntasRepetidasPelaIa.push(p);
      } else {
        perguntasDaIa.push(p);
      }
    }
  }
  if (perguntasRepetidasPelaIa.length > 0) {
    reprovacoes.push(`repetiu ${perguntasRepetidasPelaIa.length} pergunta(s) que já tinha feito`);
  }

  /*
   * ---- o CLIENTE precisou repetir a pergunta
   *
   * Este é o sinal mais forte do arquivo, e o mais barato: não há como
   * decidir por regra se uma resposta "respondeu" a pergunta — mas se o
   * cliente refaz a mesma pergunta dois turnos depois, ela não respondeu.
   * Quem julga é o comportamento dele, não uma rubrica.
   */
  const perguntasDoCliente: { texto: string; turno: number }[] = [];
  const perguntasReaparecidas: string[] = [];
  turnos.forEach((t, i) => {
    for (const balao of t.cliente) {
      for (const p of perguntasDe(balao)) {
        const antes = perguntasDoCliente.find(
          (q) => q.turno < i && semelhanca(q.texto, p) >= SEMELHANTES,
        );
        if (antes) perguntasReaparecidas.push(p);
        else perguntasDoCliente.push({ texto: p, turno: i });
      }
    }
  });
  if (perguntasReaparecidas.length > 0) {
    reprovacoes.push(
      `o cliente teve de repetir ${perguntasReaparecidas.length} pergunta(s) — ela não respondeu`,
    );
  }

  // ---- a IA repete a própria resposta
  let respostasRepetidas = 0;
  for (let i = 1; i < turnos.length; i++) {
    for (let j = 0; j < i; j++) {
      if (semelhanca(turnos[i].bot, turnos[j].bot) >= 0.8) {
        respostasRepetidas++;
        break;
      }
    }
  }
  if (respostasRepetidas > 0) {
    reprovacoes.push(`mandou ${respostasRepetidas} resposta(s) quase idêntica(s) a uma anterior`);
  }

  // ---- a conversa andou?
  const assuntosCobertos: string[] = [];
  let sequenciaSemNovidade = 0;
  let maiorSequenciaSemNovidade = 0;
  for (const t of turnos) {
    const novos = assuntosDe(`${t.bot} ${t.cliente.join(" ")}`).filter(
      (a) => !assuntosCobertos.includes(a),
    );
    if (novos.length > 0) {
      assuntosCobertos.push(...novos);
      sequenciaSemNovidade = 0;
    } else {
      sequenciaSemNovidade++;
      maiorSequenciaSemNovidade = Math.max(maiorSequenciaSemNovidade, sequenciaSemNovidade);
    }
  }
  if (maiorSequenciaSemNovidade > TURNOS_SEM_NOVIDADE_TOLERADOS) {
    reprovacoes.push(`${maiorSequenciaSemNovidade} turnos seguidos sem assunto novo`);
  }

  // ---- a voz é a mesma do começo ao fim?
  const modelos = [...new Set(turnos.map((t) => t.modelo).filter((m): m is string => Boolean(m)))];
  if (modelos.length > 1) {
    reprovacoes.push(`a voz mudou no meio da conversa: ${modelos.join(", ")}`);
  }

  // ---- tamanho
  const tamanhos = turnos.map((t) => t.bot.length).filter((n) => n > 0);
  const mediaDeCaracteres = tamanhos.length
    ? Math.round(tamanhos.reduce((s, n) => s + n, 0) / tamanhos.length)
    : 0;
  const maiorMensagem = tamanhos.length ? Math.max(...tamanhos) : 0;
  if (maiorMensagem > TAMANHO_CONFORTAVEL * 2) {
    reprovacoes.push(`a maior resposta tem ${maiorMensagem} caracteres`);
  }

  return {
    turnos: turnos.length,
    turnoDaOfertaDeVisita: turnoDaOferta,
    midiasRepetidas,
    perguntasRepetidasPelaIa,
    perguntasReaparecidas,
    respostasRepetidas,
    maiorSequenciaSemNovidade,
    assuntosCobertos,
    modelos,
    mediaDeCaracteres,
    maiorMensagem,
    reprovacoes,
  };
}

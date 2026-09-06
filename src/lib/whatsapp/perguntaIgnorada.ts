import { perguntasDe, semelhanca } from "./metricasConversa";
import type { Fala } from "./rajada";

/**
 * O cliente já perguntou isso e não foi respondido.
 *
 * ## O defeito, medido
 *
 * O eval de conversa da v25 (31/08/2026) mediu **27 vezes** em que o
 * cliente teve de repetir uma pergunta que a Sofia não respondeu, em 16
 * conversas. O caso extremo, `insiste-no-desconto`, é uma aula: o cliente
 * pergunta o valor DOZE vezes; ela desvia doze vezes e refaz a pergunta de
 * qualificação doze vezes. Nenhum dos dois se move até o teto de turnos.
 *
 * O eval SABIA disso — a métrica existe lá desde o começo. A produção, não:
 * nada no caminho do atendimento percebia que o cliente estava repetindo.
 * Este módulo é a métrica do eval virando pendência do prompt, do mesmo
 * jeito que `funilQualificacao` virou.
 *
 * ## Por que a repetição do cliente é a régua
 *
 * Não existe regra que decida, olhando um texto, se ele *respondeu* a
 * pergunta. Existe uma que decide melhor que qualquer rubrica: **se o
 * cliente refaz a pergunta, ela não foi respondida.** Quem julga é o
 * comportamento dele, não uma opinião nossa — a mesma escolha que já
 * sustenta as métricas de conversa.
 *
 * ## O que ele NÃO faz
 *
 * Não detecta paráfrase distante nem ironia, e isso é decidido: o erro é
 * assimétrico. Deixar passar custa uma pendência não levantada; acusar
 * repetição que não houve faria a Sofia se desculpar por algo que ela
 * respondeu, que é pior do que o silêncio. É a mesma régua que o eval usa
 * para não detectar paráfrase.
 */

/** A partir de quantas vezes a mesma pergunta vira pendência. */
const VEZES_PARA_VIRAR_PENDENCIA = 2;

/**
 * Preço/desconto tem resposta CERTA nesta casa, e ela não é o desvio.
 *
 * A tensão "a IA não fala valores" já foi resolvida, e a solução veio do
 * material do próprio corretor: a visita é o lugar onde os números são
 * tratados. Desviar sem oferecer a visita é esquiva; oferecer a visita é
 * resposta. A v25 só chegava nisso no turno 12, quando chegava.
 */
const SOBRE_DINHEIRO =
  /\b(valor|valores|preco|precos|quanto custa|quanto sai|desconto|entrada|parcela|financiamento|condicao de pagamento)\b/;

function normalizarSimples(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export interface PerguntaIgnorada {
  /** A pergunta como o cliente a escreveu da última vez. */
  pergunta: string;
  /** Quantas vezes ele já perguntou, contando a atual. */
  vezes: number;
  /** Se é sobre dinheiro — o caso que tem resposta própria na casa. */
  sobreDinheiro: boolean;
}

/**
 * A pergunta que o cliente está repetindo, ou `null`.
 *
 * Quando há mais de uma, devolve a MAIS repetida: é a que mais incomoda, e
 * um bloco com duas ordens vira nenhuma.
 */
export function perguntaIgnorada(params: {
  historico: readonly Fala[];
  mensagemAtual: string;
}): PerguntaIgnorada | null {
  const agora = perguntasDe(params.mensagemAtual);
  if (agora.length === 0) return null;

  const anteriores = params.historico
    .filter((f) => f.remetente === "cliente")
    .flatMap((f) => perguntasDe(f.texto));

  if (anteriores.length === 0) return null;

  let melhor: PerguntaIgnorada | null = null;

  for (const pergunta of agora) {
    // +1 pela vez de agora: `anteriores` só tem o histórico.
    const vezes = 1 + anteriores.filter((a) => semelhanca(a, pergunta) >= 0.6).length;
    if (vezes < VEZES_PARA_VIRAR_PENDENCIA) continue;

    if (!melhor || vezes > melhor.vezes) {
      melhor = {
        pergunta: pergunta.trim(),
        vezes,
        sobreDinheiro: SOBRE_DINHEIRO.test(normalizarSimples(pergunta)),
      };
    }
  }

  return melhor;
}

/**
 * O bloco que entra no prompt. Curto e imperativo de propósito: ele precisa
 * ganhar de outras vinte e tantas regras, e regra longa perde para regra
 * curta quando as duas competem pela mesma decisão.
 */
export function blocoPerguntaIgnorada(p: PerguntaIgnorada): string {
  const linhas = [
    `PARE — O CLIENTE JÁ PERGUNTOU ISTO ${p.vezes} VEZES E VOCÊ NÃO RESPONDEU:`,
    `"${p.pergunta}"`,
    "",
    "Repetir o desvio e devolver outra pergunta de qualificação é o que travou esta conversa.",
    "Nesta resposta, ANTES de qualquer outra coisa:",
  ];

  if (p.sobreDinheiro) {
    linhas.push(
      "1. Diga com todas as letras que o valor exato quem passa é a construtora, e que ele muda por unidade — sem rodeio e sem repetir a frase que você já usou.",
      "2. E ofereça O CAMINHO que resolve: a visita é onde os números, o fluxo e as condições são tratados. Proponha um horário CONCRETO (\"sábado de manhã\" vale; \"quer agendar?\" não).",
      "3. Só depois, e só se ele responder, volte ao funil.",
    );
  } else {
    linhas.push(
      "1. Responda o que ele perguntou, com o que você TEM. Se não souber, diga que não sabe e diga o que vai fazer para descobrir.",
      "2. NÃO repita a pergunta de qualificação que ele já ignorou duas vezes — ela não vai ser respondida enquanto a dele não for.",
    );
  }

  if (p.vezes >= 3) {
    linhas.push(
      "",
      "Ele já repetiu três vezes ou mais: reconheça em UMA frase curta que demorou a responder. Sem pedir desculpas longas.",
    );
  }

  return linhas.join("\n");
}

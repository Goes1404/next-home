/**
 * Regra que só entra quando faz falta.
 *
 * ## O problema medido
 *
 * O prompt do sistema está em **36.324 caracteres e 37 regras** — 71% dele
 * é regra. A literatura de arquitetura de agentes tem nome para isso:
 * *monolithic mega-prompt*, um anti-padrão. Instruções heterogêneas
 * interferem entre si e o contexto relevante de cada tarefa é diluído pelo
 * das outras; confiabilidade cai conforme o prompt cresce.
 *
 * E não é teoria aqui. Esta base já produziu as duas provas:
 * - a regra 13 **se contradizia sozinha** (permissão no começo, proibição
 *   no fim de 1637 caracteres) e o modelo obedeceu o fim;
 * - a permissão do piso, mesmo corrigida, era usada em ~30% das conversas.
 *
 * ## O remédio, e por que é este
 *
 * A recomendação da prática atual é *progressive disclosure*: injetar a
 * instrução no momento em que ela se aplica, em vez de manter tudo sempre
 * ligado. É o que este projeto já faz, sem ter dado nome, em
 * `perguntaIgnorada`, `focoDaConversa`, `funilQualificacao`,
 * `prazoEntrega` e `ofertasDeVisita` — todos entram só quando cabem.
 *
 * Este módulo é o lugar das regras que já existiam FIXAS e cuja condição de
 * uso é barata de detectar. Cada uma que sai da lista fixa devolve atenção
 * às que ficam.
 *
 * ## O critério para mover uma regra para cá
 *
 * 1. Ela só faz sentido numa situação específica e identificável.
 * 2. A detecção é determinística e barata (nada de outra chamada de LLM).
 * 3. Não estar presente quando a situação NÃO ocorre não muda nada.
 *
 * Regra que vale sempre — tom, tamanho da mensagem, o que é proibido
 * afirmar — continua fixa. Torná-la condicional seria trocar prompt
 * grande por comportamento imprevisível.
 */

export interface SituacaoDoTurno {
  /** Quantos balões o cliente mandou nesta vez. */
  baloesDaVez: number;
}

/**
 * A regra da rajada só existe quando há rajada.
 *
 * Ela ocupava 698 caracteres em TODO turno e só se aplica quando o cliente
 * mandou mais de uma mensagem — e o histórico de produção mostra que isso
 * é minoria. Fixa, ela competia com as outras 36 em 100% das vezes para
 * valer numa fração delas.
 */
const RAJADA = [
  "O CLIENTE MANDOU VÁRIAS MENSAGENS SEGUIDAS E NENHUMA FOI RESPONDIDA.",
  "Responda o conteúdo de TODAS antes de perguntar qualquer outra coisa: se ele fez duas perguntas, as duas têm resposta na sua vez.",
  "Responder só a última é o erro mais comum aqui — e a última costuma ser a menos importante (\"...e tem vaga?\" depois de \"qual a metragem do de 3 dorm?\").",
  "Isso NÃO muda o seu jeito de escrever: continue em mensagens curtas, uma ideia em cada — duas respostas curtas, nunca um parágrafo com tópicos.",
  "Se dois balões disserem a mesma coisa, é uma resposta só.",
].join("\n");

/** O bloco com as regras que se aplicam a ESTE turno, ou `undefined`. */
export function regrasCondicionais(situacao: SituacaoDoTurno): string | undefined {
  const regras: string[] = [];

  if (situacao.baloesDaVez > 1) regras.push(RAJADA);

  return regras.length > 0 ? regras.join("\n\n") : undefined;
}

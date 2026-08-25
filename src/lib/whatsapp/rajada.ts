/**
 * A rajada: o cliente que escreve em vários balões seguidos.
 *
 * No WhatsApp ninguém escreve um parágrafo — escreve "oi", "tudo bem?",
 * "queria saber do apartamento de 3 dorm", "e tem vaga coberta?" em quatro
 * balões de dez segundos. O webhook já sabia AGRUPAR isso (espera 6s e só a
 * invocação do balão mais recente responde), mas o que ela mandava para a
 * IA era só o ÚLTIMO balão como "mensagem atual"; os anteriores caíam no
 * meio do histórico, indistinguíveis de qualquer fala de dez minutos atrás.
 *
 * O efeito em produção é o cliente perguntar duas coisas e receber resposta
 * de uma: a IA responde a última linha, que costuma ser a menos importante
 * ("e tem vaga?"), e ignora a pergunta que motivou o contato. Do lado de
 * quem escreveu, isso lê como desatenção — a mesma sensação de mandar
 * mensagem para alguém que só olha a última linha.
 *
 * Aqui a conversa é separada em duas partes: o que já foi respondido
 * (histórico) e o que chegou desde a última resposta e AINDA NÃO FOI
 * (pendente). O prompt trata as duas de formas diferentes, e é isso que
 * permite exigir da IA que responda todas as perguntas em aberto.
 *
 * A regra de corte é simples e não depende de relógio: a rajada é a
 * sequência final de falas do CLIENTE. Qualquer fala do bot ou do corretor
 * fecha a rajada — se alguém já respondeu, o que veio antes está
 * respondido. Sem depender de timestamp de propósito: o webhook tem
 * espera de 6s, reentrega, debounce e retentativa, e relógio nesse cenário
 * é uma fonte de erro a mais.
 */

export type Fala = { remetente: "cliente" | "bot" | "corretor"; texto: string };

/**
 * Teto de balões numa rajada só.
 *
 * Cliente ansioso manda quinze mensagens; responder às quinze de uma vez
 * daria um texto de robô despejando tópicos, exatamente o oposto do estilo
 * medido da casa (média de 47 caracteres por mensagem). Passando disso, as
 * mais RECENTES vencem — é a pergunta mais fresca que ele está esperando
 * ver respondida, e as antigas continuam no histórico, visíveis.
 */
const MAXIMO_BALOES = 8;

/**
 * Parte a conversa em "já respondido" e "esperando resposta".
 *
 * `historico` deve vir em ordem cronológica (a mais antiga primeiro), que é
 * o que `historicoRecente` devolve.
 */
export function separarRajada(historico: Fala[]): {
  /** O que a IA lê como contexto — sem os balões que ela precisa responder agora. */
  historico: Fala[];
  /** Os balões em aberto, do mais antigo ao mais recente. Vazio se a última fala não é do cliente. */
  pendentes: string[];
} {
  let corte = historico.length;
  while (corte > 0 && historico[corte - 1].remetente === "cliente") corte--;

  const pendentes = historico
    .slice(corte)
    .map((m) => m.texto.trim())
    .filter((t) => t.length > 0);

  /*
   * Os balões que passaram do teto NÃO somem: voltam para o histórico, no
   * lugar cronológico deles. Descartar fala de cliente seria perder
   * informação que ele deu — o que a rajada resolve é ONDE a fala aparece
   * no prompt, nunca SE ela aparece.
   */
  const excedente = Math.max(0, pendentes.length - MAXIMO_BALOES);

  return {
    historico: historico.slice(0, corte + excedente),
    pendentes: pendentes.slice(excedente),
  };
}

/**
 * O bloco final do prompt: o que o cliente acabou de dizer.
 *
 * Um balão só sai como sempre saiu (`Cliente: ...`) — a esmagadora maioria
 * das mensagens é assim, e mudar o formato delas mexeria no comportamento
 * de todas as conversas para resolver o caso de algumas.
 *
 * Com mais de um, cada balão vira uma linha e ganha um cabeçalho dizendo o
 * que eles são. O cabeçalho existe porque, sem ele, quatro linhas `Cliente:`
 * são visualmente iguais a quatro linhas de histórico — e a instrução de
 * responder todas não teria a que se referir.
 */
export function blocoDaVezDoCliente(baloes: string[]): string {
  const limpos = baloes.map((b) => b.trim()).filter(Boolean);
  if (limpos.length <= 1) return `Cliente: ${limpos[0] ?? ""}`;

  return (
    `[o cliente mandou ${limpos.length} mensagens seguidas, todas AINDA SEM RESPOSTA — ` +
    `responda o conteúdo de todas elas]\n` +
    limpos.map((b) => `Cliente: ${b}`).join("\n")
  );
}

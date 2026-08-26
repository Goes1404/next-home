import type { Empreendimento } from "@/lib/types";
import type { DossieClienteIA } from "./types";

/**
 * A CAPACIDADE de compra ainda falta nesta conversa?
 *
 * Existe por causa de um defeito MEDIDO no eval da v22
 * (`renda-antes-da-visita`): com região, estágio e tipologia já na mesa, a
 * resposta indicou imóvel e ofereceu material — sem nunca perguntar a
 * renda. O funil do prompt manda perguntar a renda ANTES de indicar
 * (passo 4), e mesmo assim aconteceu: instrução de prompt é
 * probabilística, e esta compete com outras 28 regras.
 *
 * A correção segue o padrão da casa (`focoDaConversa`, `resolverMidia`): o
 * CÓDIGO decide e o prompt recebe um bloco curto e imperativo sobre a
 * situação desta conversa, em vez de uma regra geral perdida no meio. O
 * modelo continua escrevendo a pergunta com as palavras dele — o que muda
 * é ele não poder deixar de saber que ela está pendente.
 *
 * O erro aqui é assimétrico e a régua sai dele: perguntar de novo a quem
 * já respondeu é o defeito nº 1 deste projeto (cliente some quando tem de
 * repetir). Então a função é CONSERVADORA — só aponta pendência quando há
 * evidência de que o funil já andou até ali, e nenhum sinal de que o
 * assunto foi tocado.
 *
 * ## Por que não é mais "a pergunta da renda" (26/08/2026)
 *
 * A renda é o dado que o BANCO usa, mas perguntá-la de chofre é o momento
 * mais frágil da conversa: é a única pergunta do funil que soa a
 * sindicância. O que interessa é a CAPACIDADE, e há caminhos menos
 * invasivos que chegam nela — a faixa de valor que o cliente procura
 * (quase todo mundo responde), e se ele compra sozinho ou em conjunto
 * (muda o que o banco financia, e é conversa natural).
 *
 * Então a pendência é satisfeita por QUALQUER um deles: orçamento OU
 * renda. Quem já disse "até 600 mil" não precisa abrir a folha de
 * pagamento para receber uma indicação coerente.
 */

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Fala em que o assunto renda aparece — do cliente ou da assistente. */
const FALA_DE_RENDA = /\brenda\b|\bsalari|\bganh(o|a|amos|am)\b|por\s+m[êe]s|mensal(mente)?\b|\bcontracheque\b|\bholerite\b/;

/** O cliente disse quantos dormitórios/suítes quer. */
const FALA_DE_TIPOLOGIA = /\b\d+\s*(dorm|quart|suit|suít)/;

/**
 * O cliente já falou de dinheiro — faixa, teto ou financiamento aprovado.
 *
 * Conta como capacidade respondida mesmo antes de o dossiê ser reextraído
 * (ele roda DEPOIS da resposta): sem isto, quem acabou de dizer "até 600
 * mil" ouviria a pergunta de capacidade na mesma vez.
 */
const FALA_DE_VALOR =
  /\b(ate|até)\s*(r\$)?\s*\d|\b\d+\s*(mil|milhao|milhão|milhoes|milhões)\b|\br\$\s*\d|\bor[çc]amento\b|\bfinanciamento\s+aprovado\b|\bcredito\s+aprovado\b|\bcrédito\s+aprovado\b/;

/** Quantas falas da assistente contam como "acabei de perguntar". */
const JANELA_ANTI_INSISTENCIA = 2;

export type Fala = { remetente: string; texto: string };

/**
 * Quando a renda é a próxima pergunta desta conversa.
 *
 * Devolve `true` só quando TODAS as condições valem:
 * - a renda não é conhecida (nem no dossiê, nem dita na conversa);
 * - a assistente não acabou de perguntar (o prompt manda não insistir —
 *   quem desconversou pergunta-se de novo mais adiante, não na sequência);
 * - o funil já passou por região E tipologia, que é onde a renda entra;
 * - o cliente já falou o suficiente para a pergunta não soar abrupta.
 */
export function capacidadeEstaPendente(params: {
  dossie?: Pick<
    DossieClienteIA,
    "rendaMensal" | "regiaoInteresse" | "dormitoriosMin" | "orcamentoMin" | "orcamentoMax"
  > | null;
  historico?: Fala[];
  mensagemAtual?: string;
  catalogo?: Empreendimento[];
}): boolean {
  const { dossie } = params;
  // Qualquer um dos dois já responde "o que cabe no bolso dele".
  if (dossie?.rendaMensal != null) return false;
  if (dossie?.orcamentoMin != null || dossie?.orcamentoMax != null) return false;

  const historico = params.historico ?? [];
  const falasCliente = historico.filter((m) => m.remetente === "cliente").map((m) => m.texto);
  const falasBot = historico.filter((m) => m.remetente === "bot").map((m) => m.texto);
  const doCliente = normalizar([...falasCliente, params.mensagemAtual ?? ""].join(" \n "));

  // O cliente já tocou no assunto — renda OU valor: nunca reperguntar.
  if (FALA_DE_RENDA.test(doCliente) || FALA_DE_VALOR.test(doCliente)) return false;

  // A assistente perguntou há pouco: insistir na sequência afasta o lead.
  const ultimasDoBot = normalizar(falasBot.slice(-JANELA_ANTI_INSISTENCIA).join(" \n "));
  if (FALA_DE_RENDA.test(ultimasDoBot) || FALA_DE_VALOR.test(ultimasDoBot)) return false;

  // Conversa ainda no começo: a renda não é a próxima pergunta de quem
  // acabou de dizer "oi".
  if (falasCliente.length + (params.mensagemAtual?.trim() ? 1 : 0) < 3) return false;

  const temRegiao = Boolean(dossie?.regiaoInteresse) || citaLugarDoCatalogo(doCliente, params.catalogo);
  const temTipologia = dossie?.dormitoriosMin != null || FALA_DE_TIPOLOGIA.test(doCliente);

  return temRegiao && temTipologia;
}

/** O cliente citou um bairro ou cidade que existe no catálogo. */
function citaLugarDoCatalogo(textoNormalizado: string, catalogo?: Empreendimento[]): boolean {
  for (const imovel of catalogo ?? []) {
    for (const lugar of [imovel.bairro, imovel.cidade]) {
      const alvo = normalizar(lugar ?? "");
      // Piso de 4 letras: pedaço curto casa com qualquer coisa.
      if (alvo.length >= 4 && textoNormalizado.includes(alvo)) return true;
    }
  }
  return false;
}

/**
 * O bloco que entra no prompt quando a renda está pendente.
 *
 * Curto e imperativo de propósito: bloco longo vira mais uma regra entre
 * regras, que é exatamente o que não funcionou.
 */
export function blocoCapacidadePendente(): string {
  return [
    "PENDÊNCIA DESTA CONVERSA — CAPACIDADE DE COMPRA:",
    "Você já sabe onde ele procura e o que ele quer, e AINDA NÃO SABE o que cabe no bolso dele. É a próxima pergunta.",
    "NÃO indique imóvel, não mande material e não proponha horário antes disso — indicar sem saber leva alguém a uma visita que não cabe, e isso queima o lead e a manhã do corretor.",
    "Comece pelo caminho MENOS invasivo, e pare assim que tiver a resposta:",
    "1) a faixa que ele procura — \"qual faixa de valor você tem em mente?\" (quase todo mundo responde, e já basta);",
    "2) se ele compra sozinho ou em conjunto — \"a compra é só sua ou em conjunto?\" (muda o que o banco financia);",
    "3) a renda mensal, e SÓ se os dois acima não vierem — aí sim com a razão junto: \"pra eu já te mostrar o que cabe no financiamento, qual é a renda média da família por mês?\".",
    "UMA pergunta por mensagem. Se ele desconversar, siga a conversa sem insistir e volte ao assunto mais adiante — perder o lead por insistência é pior que ficar sem o dado.",
  ].join("\n");
}

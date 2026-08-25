import { perguntasDe, semelhanca } from "./metricasConversa";

/**
 * O rótulo que vem do MUNDO, não de um juiz.
 *
 * ## Por que não automatizar com juiz LLM e pronto
 *
 * Juiz automático mede a RUBRICA, e a rubrica é o que alguém achou que era
 * certo no dia em que a escreveu. Este projeto tem quatro provas de que
 * isso apodrece calado: o critério do Leblon reprovava a resposta CERTA
 * porque casava "temos … Leblon" ignorando a negação; `preco-mais-barato`
 * exigia a cifra "460" depois de a IA ter sido PROIBIDA de falar valores; e
 * `ofereceVisita` exigia a palavra "visita" contra *"podemos ver durante a
 * semana então, prefere manhã ou tarde?"*, que é o padrão exato de quem
 * converte.
 *
 * Automatizar o rótulo inteiro fecha o círculo: o sistema converge para o
 * que está escrito na rubrica, com confiança total, e ninguém percebe
 * quando a regra de negócio mudou por baixo.
 *
 * ## O que dá para automatizar sem circularidade
 *
 * O que ACONTECEU depois da resposta. Não é opinião de modelo nenhum:
 *
 * - o corretor assumiu o teclado logo depois — ele leu e achou que
 *   precisava consertar;
 * - o cliente sumiu;
 * - o cliente refez a mesma pergunta — ela não respondeu;
 * - o cliente pediu para falar com gente;
 * - a visita foi marcada.
 *
 * O primeiro é o mais valioso e sai de graça: **o corretor já rotula, só
 * não clica.** E a mensagem que ele digita não é só a nota — é a resposta
 * certa, candidata a exemplo.
 *
 * ## A ressalva que impede o pior erro
 *
 * Assumir NEM SEMPRE é correção. Às vezes o corretor entra porque o lead
 * esquentou e ele quer fechar — e aí o atendimento foi bom, não ruim. Sem
 * separar os dois casos, toda conversa de sucesso vira 👎, e um rótulo que
 * pune o sucesso é pior que rótulo nenhum. Ver `assumiuCorrigindo`.
 */

export type FalaDaConversa = {
  remetente: "cliente" | "bot" | "corretor";
  texto: string;
  /** Quando existe, liga esta mensagem à resposta da IA que a originou (0040). */
  interacaoId?: string | null;
};

export type SinalDoMundo =
  | "corretor_corrigiu"
  | "corretor_assumiu_para_fechar"
  | "cliente_repetiu_a_pergunta"
  | "cliente_pediu_humano"
  | "cliente_sumiu"
  | "cliente_seguiu";

export type LeituraDoMundo = {
  /** Índice da resposta do bot dentro do histórico recebido. */
  indice: number;
  interacaoId?: string | null;
  sinais: SinalDoMundo[];
  /** O que o corretor escreveu logo depois — candidato a exemplo. */
  correcaoDoCorretor?: string;
  /**
   * O palpite de rótulo. `null` quando o mundo não disse nada — e isso é
   * um desfecho legítimo, não um "bom" tímido.
   */
  palpite: "bom" | "ruim" | null;
};

/** Pedido explícito de gente. Mesma família do `clientePediuLigacao`. */
const PEDIU_HUMANO =
  /\b(falar com (uma |um )?(pessoa|humano|atendente|corretor)|me liga|liga pra mim|quero falar com alguem)\b/i;

/**
 * O corretor assumiu para CORRIGIR, ou para fechar?
 *
 * A diferença decide se o rótulo é 👎 ou nada, e errar aqui pune o
 * sucesso. Os sinais de correção são os que indicam que ele está
 * reescrevendo o que a IA disse: ele refaz a fala dela com outras palavras
 * sobre o mesmo assunto, ou desmente o que ela afirmou.
 *
 * Na dúvida, NÃO é correção. Uma mensagem dele como "vou te ligar agora" ou
 * "consigo sim, sábado às 10h" é continuidade de um atendimento que estava
 * funcionando.
 */
export function assumiuCorrigindo(respostaDaIa: string, falaDoCorretor: string): boolean {
  const desmente = /\bnão é|nao e |na verdade|corrigindo|me confundi|desconsider|isso está errado|nao tem isso/i.test(
    falaDoCorretor,
  );
  if (desmente) return true;

  /*
   * Ele reescreveu a mesma coisa: fala do mesmo assunto que ela acabou de
   * falar, com palavras próprias. Semelhança ALTA demais também não conta —
   * aí ele está confirmando, não corrigindo.
   */
  const s = semelhanca(respostaDaIa, falaDoCorretor);
  return s >= 0.3 && s < 0.85;
}

/**
 * Lê o que aconteceu depois de cada resposta da IA.
 *
 * `historico` em ordem cronológica. Não faz nenhuma chamada de rede: é
 * função pura sobre o que já está gravado.
 */
export function lerSinaisDoMundo(historico: FalaDaConversa[]): LeituraDoMundo[] {
  const leituras: LeituraDoMundo[] = [];

  historico.forEach((fala, i) => {
    if (fala.remetente !== "bot") return;

    const sinais: SinalDoMundo[] = [];
    let correcaoDoCorretor: string | undefined;

    const seguinte = historico[i + 1];

    if (!seguinte) {
      /*
       * Última mensagem da conversa. NÃO é "cliente sumiu": pode ter sido
       * enviada há trinta segundos. Quem sabe se houve silêncio é o
       * relógio, e ele não está aqui — quem chama decide, com a data.
       */
      leituras.push({ indice: i, interacaoId: fala.interacaoId, sinais, palpite: null });
      return;
    }

    if (seguinte.remetente === "corretor") {
      if (assumiuCorrigindo(fala.texto, seguinte.texto)) {
        sinais.push("corretor_corrigiu");
        correcaoDoCorretor = seguinte.texto;
      } else {
        sinais.push("corretor_assumiu_para_fechar");
      }
    }

    if (seguinte.remetente === "cliente") {
      if (PEDIU_HUMANO.test(seguinte.texto)) sinais.push("cliente_pediu_humano");

      /*
       * O cliente refez uma pergunta que já tinha feito ANTES desta
       * resposta. É o sinal mais forte que existe aqui: não há regra que
       * decida se uma resposta "respondeu", mas se ele repete, ela não
       * respondeu. Quem julga é o comportamento dele.
       */
      const perguntasAnteriores = historico
        .slice(0, i)
        .filter((f) => f.remetente === "cliente")
        .flatMap((f) => perguntasDe(f.texto));

      const repetiu = perguntasDe(seguinte.texto).some((p) =>
        perguntasAnteriores.some((antes) => semelhanca(antes, p) >= 0.6),
      );
      if (repetiu) sinais.push("cliente_repetiu_a_pergunta");

      if (sinais.length === 0) sinais.push("cliente_seguiu");
    }

    leituras.push({
      indice: i,
      interacaoId: fala.interacaoId,
      sinais,
      correcaoDoCorretor,
      palpite: palpitarRotulo(sinais),
    });
  });

  return leituras;
}

/**
 * O palpite do mundo — deliberadamente cru.
 *
 * `null` (o mundo não disse nada) é resultado legítimo e o mais comum. Um
 * palpite "bom" para toda resposta que não deu problema encheria o dataset
 * de exemplos sem informação, e o sistema aprenderia que o normal é ótimo.
 */
export function palpitarRotulo(sinais: SinalDoMundo[]): "bom" | "ruim" | null {
  if (sinais.includes("corretor_corrigiu")) return "ruim";
  if (sinais.includes("cliente_repetiu_a_pergunta")) return "ruim";
  if (sinais.includes("cliente_pediu_humano")) return "ruim";
  if (sinais.includes("cliente_sumiu")) return "ruim";
  return null;
}

/**
 * Quem o humano precisa olhar: onde o mundo e o juiz DISCORDAM.
 *
 * Onde os dois concordam, o rótulo humano não acrescenta informação — e
 * pedir que alguém leia duzentas conversas para confirmar o óbvio é o jeito
 * mais certo de não colher rótulo nenhum. Foi o que aconteceu com o 👍/👎:
 * existe desde a 0040 e colheu ZERO.
 */
export function precisaDeOlhoHumano(
  palpiteDoMundo: "bom" | "ruim" | null,
  notaDoJuiz: "bom" | "ruim" | null,
): boolean {
  if (palpiteDoMundo === null || notaDoJuiz === null) return false;
  return palpiteDoMundo !== notaDoJuiz;
}

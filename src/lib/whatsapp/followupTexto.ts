import type { DossieClienteIA } from "./types";

/**
 * A instrução extra que o runner de follow-ups passa ao agente.
 *
 * Era uma frase única e genérica ("retome a conversa com leveza"), e o
 * resultado era o follow-up genérico que o roadmap (item 6) mandou
 * matar: "oi, tudo bem?" não retoma nada. Aqui a instrução ganha o que a
 * conversa já sabe — os GANCHOS do dossiê — e muda de figura conforme o
 * tipo e a tentativa:
 *
 * - reengajamento, 1ª vez: retomada com gancho concreto;
 * - reengajamento, 2ª vez: cutucada de UMA linha (medido nas conversas da
 *   corretora real que convertem — ver estiloDaCasa);
 * - lembrete de visita: véspera, confirma presença, uma frase.
 *
 * Função pura de propósito: o texto que orienta a IA é regra de negócio, e
 * regra de negócio sem teste é a que regride calada.
 */

export function ganchosDoDossie(
  dossie: Pick<DossieClienteIA, "regiaoInteresse" | "dormitoriosMin"> | null | undefined,
): string {
  const partes: string[] = [];
  if (dossie?.regiaoInteresse) partes.push(`ele procura em ${dossie.regiaoInteresse}`);
  if (dossie?.dormitoriosMin) partes.push(`quer ${dossie.dormitoriosMin}+ dormitórios`);
  return partes.join("; ");
}

export function instrucaoDoFollowup(params: {
  tipo: "reengajamento" | "lembrete_visita" | "pos_visita" | "indicacao";
  tentativa: number;
  dossie?: Pick<DossieClienteIA, "regiaoInteresse" | "dormitoriosMin"> | null;
  /** Data/hora da visita, já formatada em São Paulo (só para lembrete). */
  visitaFormatada?: string;
  /**
   * O endereço do imóvel, do CADASTRO (só para lembrete).
   *
   * Vem por parâmetro e não da cabeça do modelo pela mesma razão do link da
   * página: o cliente lê o lembrete na véspera, sai de casa e vai para onde
   * a mensagem mandou. Sem endereço cadastrado, a instrução PROÍBE inventar.
   */
  enderecoDoImovel?: string | null;
  /** Nome do empreendimento, do cadastro (só para lembrete). */
  nomeDoImovel?: string | null;
  /**
   * O cliente NUNCA falou nesta conversa — recebeu um disparo e não
   * respondeu. É o caso que passou a existir em 31/08, quando a campanha
   * finalmente começou a agendar follow-up (antes, os 87 disparos entregues
   * não geravam nenhum).
   *
   * Precisa de instrução própria porque a linguagem de retomada MENTE aqui:
   * "voltando ao que conversamos" para quem nunca disse uma palavra é a
   * primeira coisa que entrega um robô — não houve conversa nenhuma.
   */
  clienteNuncaFalou?: boolean;
}): string {
  if (params.tipo === "indicacao") {
    /*
     * Pedido de indicação depois do fechamento (0123). É o momento em que o
     * cliente está mais satisfeito e ainda lembra de quem ajudou. Uma
     * mensagem, um pedido, nenhuma venda para ele.
     */
    return (
      `Este é o PEDIDO DE INDICAÇÃO: o cliente fechou negócio${params.nomeDoImovel ? ` no ${params.nomeDoImovel}` : ""} ` +
      "há alguns dias. Mande UMA mensagem curta: agradeça a confiança, pergunte como ele está com a conquista " +
      "e peça, sem pressão, se conhece alguém que também esteja procurando imóvel — o corretor atende com o " +
      "mesmo cuidado. NÃO ofereça imóveis a ele, NÃO fale valores."
    );
  }

  if (params.tipo === "pos_visita") {
    /*
     * O dia seguinte à visita é quando o cliente decide — e até aqui nada
     * acontecia sozinho depois dela. A pergunta é UMA e aberta: o que ele
     * achou. Sem reoferta, sem pressão para fechar e sem valor: a resposta
     * dele é o que diz ao corretor qual é o próximo passo.
     */
    return (
      `Este é o PÓS-VISITA: o cliente visitou${params.nomeDoImovel ? ` o ${params.nomeDoImovel}` : " o imóvel"} ` +
      `${params.visitaFormatada ? `(${params.visitaFormatada}) ` : ""}` +
      "e ainda não comentou nada. Mande UMA mensagem curta agradecendo a visita e perguntando o que ele achou — " +
      "de forma aberta, sem sugerir a resposta. " +
      "NÃO ofereça outros imóveis, NÃO fale de valores e NÃO pressione para fechar: " +
      "o que ele responder é o que decide o próximo passo."
    );
  }

  if (params.tipo === "lembrete_visita") {
    /*
     * O ENDEREÇO vem daqui, do cadastro — nunca da cabeça do modelo.
     *
     * A versão anterior dizia "se fizer sentido, inclua um detalhe útil
     * (ponto de encontro...)", que é um convite para inventar. Endereço
     * inventado num lembrete de véspera é o pior lugar possível para a
     * invenção acontecer: o cliente lê na noite anterior, sai de casa e vai
     * para o lugar errado. É a mesma razão pela qual o link da página é
     * montado por código e a IA nunca o escreve.
     */
    const ondeEncontrar = params.enderecoDoImovel?.trim()
      ? `O endereço é: ${params.enderecoDoImovel.trim()} — escreva-o EXATAMENTE assim, sem mudar nem completar nada.`
      : "NÃO diga endereço, ponto de encontro nem número de unidade: eles não estão cadastrados, e endereço inventado manda o cliente para o lugar errado. Diga que o corretor confirma o ponto de encontro.";

    return (
      `Este é um LEMBRETE DE VISITA: o cliente tem visita marcada para ${params.visitaFormatada ?? "amanhã"}` +
      `${params.nomeDoImovel ? ` no ${params.nomeDoImovel}` : ""}. ` +
      "Lembre com simpatia, em UMA frase curta, e pergunte se está confirmado — sem tom de cobrança. " +
      `${ondeEncontrar} ` +
      "NÃO reofereça outros imóveis nem reabra qualificação: a mensagem é só sobre a visita."
    );
  }

  /*
   * Quem recebeu disparo e não respondeu não é "cliente que sumiu": é
   * alguém que ainda não entrou na conversa. Tratar os dois igual produz a
   * frase mais falsa possível — retomar algo que nunca aconteceu.
   */
  if (params.clienteNuncaFalou) {
    if (params.tentativa >= 2) {
      return (
        "Este cliente recebeu DUAS mensagens nossas e nunca respondeu. " +
        "Mande UMA linha só, leve, com uma porta aberta — sem cobrar resposta, " +
        "sem perguntar se recebeu, e sem dizer que é a última tentativa. " +
        "NUNCA diga \"retomando\", \"voltando ao nosso papo\" ou equivalente: não houve conversa."
      );
    }
    return (
      "Este cliente recebeu UMA mensagem nossa sobre um imóvel e não respondeu — " +
      "ele ainda não falou nada nesta conversa. " +
      "Mande uma mensagem curta acrescentando UMA informação concreta e nova sobre o imóvel " +
      "que foi oferecido (algo que valha o segundo toque), e termine com uma pergunta fácil de responder. " +
      "NUNCA diga \"retomando nossa conversa\", \"como falamos\" ou equivalente: não houve conversa, " +
      "e fingir que houve é a forma mais rápida de entregar que é um robô."
    );
  }

  const ganchos = ganchosDoDossie(params.dossie);
  const ancora = ganchos
    ? ` Você já sabe: ${ganchos}. Use UM desses ganchos (ou o imóvel deixado em aberto) para ancorar a retomada em algo CONCRETO — "oi, tudo bem?" não retoma nada.`
    : " Ancore a retomada no último assunto concreto da conversa — \"oi, tudo bem?\" não retoma nada.";

  if (params.tentativa >= 2) {
    return (
      "Este é o SEGUNDO follow-up: o cliente não respondeu nem à retomada. " +
      "UMA linha só, leve, no estilo cutucada — uma informação nova ou uma porta aberta, nunca cobrança, " +
      "e sem dizer que é a última tentativa." +
      ancora
    );
  }

  return (
    "Este é um FOLLOW-UP: o cliente parou de responder. Retome a conversa em 1-2 frases curtas " +
    "a partir do último assunto, com leveza — um lembrete gentil ou uma informação nova que agregue, " +
    "NUNCA cobrança ou pressão. Não repita a última mensagem enviada." +
    ancora
  );
}

/** Data/hora da visita no fuso de São Paulo — a mesma armadilha do calendário do bot. */
export function formatarVisitaSP(iso: string): string {
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${dia}, às ${hora}`;
}

/** Até quando a resposta do cliente ainda conta como resposta ao pós-visita. */
export const JANELA_RESPOSTA_POS_VISITA_H = 72;

/**
 * A mensagem que o cliente mandou agora responde ao pós-visita? (0121)
 *
 * Sim quando o pós-visita saiu há menos de 72h e foi a ÚLTIMA palavra nossa
 * na conversa: se a IA ou o corretor falaram depois, a conversa já andou e
 * o próximo passo é outro. Dois minutos de folga porque a própria mensagem
 * do pós-visita é gravada logo depois do envio.
 */
export function respondeAoPosVisita(
  enviadoEm: string | null | undefined,
  historico: ReadonlyArray<{ remetente: string; em?: string | null }>,
  agora = new Date(),
): boolean {
  return respondeAoFollowup(enviadoEm, historico, JANELA_RESPOSTA_POS_VISITA_H, agora);
}

/**
 * O que fazer com a resposta ao pós-visita. Gostou → o passo seguinte é
 * concreto (simulação ou proposta, que o corretor conduz). Não gostou → o
 * que não agradou, e UMA alternativa que resolva exatamente isso. Em
 * dúvida → uma pergunta para entender. A decisão de mover o lead no funil
 * continua do corretor.
 */
export function instrucaoDaRespostaAoPosVisita(): string {
  return (
    "O cliente está RESPONDENDO ao pós-visita (você perguntou o que ele achou do imóvel visitado). " +
    "Leia a resposta e siga UM caminho: " +
    "(1) se ele gostou, agradeça em uma frase e proponha o passo seguinte concreto — " +
    "fazer a simulação do financiamento com ele ou o corretor preparar uma proposta — perguntando qual prefere; " +
    "(2) se não gostou, pergunte o que não agradou (se ele não disse) ou, se já disse, " +
    "ofereça UMA alternativa do catálogo que resolva exatamente isso; " +
    "(3) se ficou em dúvida, pergunte o que falta para decidir. " +
    "NÃO fale valores, NÃO pressione e NÃO volte a perguntar região ou tipologia: a visita já aconteceu."
  );
}

/** Até quando a resposta ainda conta como resposta ao lembrete da véspera. */
export const JANELA_RESPOSTA_LEMBRETE_H = 30;

/**
 * Responde a um follow-up nosso? Mesma régua do pós-visita, com a janela de
 * cada tipo: o follow-up foi a última palavra nossa e saiu há pouco.
 */
export function respondeAoFollowup(
  enviadoEm: string | null | undefined,
  historico: ReadonlyArray<{ remetente: string; em?: string | null }>,
  janelaH: number,
  agora = new Date(),
): boolean {
  if (!enviadoEm) return false;
  const enviado = new Date(enviadoEm).getTime();
  if (Number.isNaN(enviado) || agora.getTime() - enviado > janelaH * 3_600_000) return false;
  const ultima = historico.filter((f) => f.remetente !== "cliente" && f.em).at(-1);
  return !ultima?.em || new Date(ultima.em).getTime() <= enviado + 120_000;
}

export type LeituraDoLembrete = "confirmou" | "remarcar" | null;

/**
 * "Confirmo", "tudo certo", "estarei lá" contra "não vou conseguir",
 * "podemos remarcar". A negação vence: "não posso" contém "posso". Em
 * dúvida, `null` — o corretor lê a conversa; confirmação inventada leva
 * alguém a esperar no decorado por quem não vem.
 */
export function lerRespostaAoLembrete(texto: string): LeituraDoLembrete {
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (
    /\b(remarcar|reagendar|adiar|desmarcar|cancelar|outro dia|outro horario)\b/.test(t) ||
    /\bnao (vou|vai|consigo|posso|da|vamos|poderei)\b/.test(t)
  ) {
    return "remarcar";
  }
  if (
    /\b(confirmad[oa]|confirmo|confirmado|combinado|estarei|estaremos|vou sim|vamos sim|tudo certo|certinho|pode deixar|ok|sim)\b/.test(t) ||
    /👍|✅/.test(texto)
  ) {
    return "confirmou";
  }
  return null;
}

export function instrucaoDaRespostaAoLembrete(leitura: Exclude<LeituraDoLembrete, null>): string {
  if (leitura === "confirmou") {
    return (
      "O cliente CONFIRMOU a visita respondendo ao lembrete. Agradeça em UMA frase curta e diga que o corretor " +
      "o espera. NÃO ofereça outra coisa, NÃO pergunte nada de qualificação."
    );
  }
  return (
    "O cliente quer REMARCAR a visita. Sem pressão: ofereça dois horários da lista de horários reais e deixe ele " +
    "escolher. Só dê a visita como remarcada depois que ele escolher um horário. NÃO fale valores."
  );
}

/** Até quando a resposta ainda conta como resposta ao pedido de indicação. */
export const JANELA_RESPOSTA_INDICACAO_H = 96;

export function instrucaoDaRespostaAIndicacao(): string {
  return (
    "O cliente está respondendo ao seu PEDIDO DE INDICAÇÃO. Se ele indicou alguém, agradeça de verdade e, " +
    "se faltar, peça o nome e o WhatsApp da pessoa; diga que o corretor vai falar com ela com cuidado, " +
    "citando quem indicou. Se ele disse que não tem ninguém agora, agradeça em uma frase e NÃO insista. " +
    "NÃO ofereça imóveis a ele."
  );
}

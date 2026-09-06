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
  tipo: "reengajamento" | "lembrete_visita";
  tentativa: number;
  dossie?: Pick<DossieClienteIA, "regiaoInteresse" | "dormitoriosMin"> | null;
  /** Data/hora da visita, já formatada em São Paulo (só para lembrete). */
  visitaFormatada?: string;
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
  if (params.tipo === "lembrete_visita") {
    return (
      `Este é um LEMBRETE DE VISITA: o cliente tem visita marcada para ${params.visitaFormatada ?? "amanhã"}. ` +
      "Lembre com simpatia, em UMA frase curta, e pergunte se está confirmado — sem tom de cobrança. " +
      "Se fizer sentido, inclua um detalhe útil (ponto de encontro, o que ele vai conhecer). " +
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

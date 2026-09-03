import { HORAS_PARA_AVISAR } from "@/lib/crm/quemEstaEsperando";

/**
 * A resposta que o webhook DESCARTOU.
 *
 * ## O defeito (medido em 03/09/2026)
 *
 * A pausa humana não adia a mensagem do cliente: ela a **joga fora**. O
 * webhook é o único gatilho do atendimento — quando ele decide "pausado",
 * a mensagem morre ali, e quando a pausa vence (3h) nada volta para
 * respondê-la.
 *
 * Medido no banco: **17 conversas com lead real** estavam com a última fala
 * do cliente sem resposta de ninguém, esperando em média 22 a 52 horas. Em
 * 7 delas o bot já podia falar havia horas — a pausa tinha vencido, a
 * conversa estava liberada, o bot ativo. Ninguém ia responder porque
 * ninguém ia ser chamado.
 *
 * Não é defeito da pausa: ela existe para o bot não falar por cima do
 * humano, e faz isso certo. O defeito é não haver segunda chance.
 *
 * ## Por que não basta encurtar a pausa
 *
 * Foi a correção tentada em 01/09 (24h → 3h) e ela não resolve: **80% das
 * mensagens de cliente chegam a menos de 3h da última fala da corretora**
 * na mesma conversa — ela responde 544 mensagens por semana. Encurtar mais
 * significaria o bot falando por cima dela. O que faltava era a varredura.
 *
 * Módulo puro: quem lê o banco e envia é o runner.
 */

/**
 * Abaixo disto não é atraso, é o intervalo normal de uma conversa.
 *
 * É deliberadamente o MESMO limiar do aviso por e-mail: "atraso" tem uma
 * definição só nesta casa, e duas divergiriam — o painel diria que a pessoa
 * está esperando enquanto o bot ainda a consideraria em dia. Há teste
 * amarrando os dois; se alguém mudar um, o outro aparece.
 */
export const HORAS_PARA_RESPONDER = HORAS_PARA_AVISAR;

/**
 * Acima disto, responder não é atender — é ressuscitar.
 *
 * Uma pergunta de duas semanas atrás já foi resolvida em outro lugar, ou
 * esfriou. Responder como se tivesse acabado de chegar é a versão mais
 * constrangedora do robô que não sabe que sumiu. O caso fica para o humano,
 * que continua vendo a pessoa na fila do Início.
 */
export const DIAS_LIMITE = 7;

export type DecisaoRespostaAtrasada =
  | { responder: true; horas: number }
  | { responder: false; motivo: "ainda_no_intervalo_normal" | "antigo_demais"; horas: number };

export function decidirRespostaAtrasada(params: {
  /** Quando o cliente falou pela última vez sem obter resposta. */
  esperandoDesde: string | Date;
  agora?: Date;
}): DecisaoRespostaAtrasada {
  const agora = params.agora ?? new Date();
  const desde = new Date(params.esperandoDesde);

  // Data inválida não pode virar "responda agora": sem saber há quanto
  // tempo a pessoa espera, o lado seguro de errar é não falar.
  const ms = agora.getTime() - desde.getTime();
  if (!Number.isFinite(ms)) {
    return { responder: false, motivo: "antigo_demais", horas: 0 };
  }

  const horas = Math.floor(ms / 3_600_000);

  if (horas < HORAS_PARA_RESPONDER) {
    return { responder: false, motivo: "ainda_no_intervalo_normal", horas };
  }
  if (horas > DIAS_LIMITE * 24) {
    return { responder: false, motivo: "antigo_demais", horas };
  }
  return { responder: true, horas };
}

/**
 * A instrução extra do turno.
 *
 * O ponto difícil aqui é o tom. A resposta chega horas depois, e há dois
 * jeitos de errar:
 *
 * 1. **Ignorar o atraso** — responder como se a mensagem tivesse acabado de
 *    chegar soa automático justamente para quem esperou.
 * 2. **Se desculpar demais** — "peço mil desculpas pela demora" ocupa a
 *    mensagem inteira com o nosso problema, e o cliente perguntou outra
 *    coisa. A corretora real não faz isso: ela responde a pergunta.
 *
 * Por isso a régua muda com o tamanho da espera. Até um dia, nem se
 * menciona — no WhatsApp isso é normal. A partir daí, UMA oração curta, e
 * o resto é a resposta.
 *
 * E a proibição que mais importa: **não recomeçar a conversa**. O erro
 * clássico aqui seria abrir com "Oi! Como posso ajudar?" para quem já fez
 * uma pergunta específica — que é exatamente o que a métrica "o cliente
 * teve de repetir" mede.
 */
export function instrucaoDaRespostaAtrasada(params: { horas: number }): string {
  const base =
    "Esta é uma resposta ATRASADA: o cliente escreveu e ficou sem resposta porque o corretor " +
    "estava atendendo. Responda AGORA o que ele perguntou, direto. " +
    "NÃO recomece a conversa, NÃO se apresente de novo e NÃO pergunte 'como posso ajudar' — " +
    "ele já disse o que queria, está tudo no histórico.";

  if (params.horas < 24) return base;

  return (
    base +
    " Já se passaram mais de 24 horas, então reconheça a demora em UMA oração curta e natural " +
    "(no máximo umas cinco palavras, do tipo 'desculpa a demora') e siga direto para a resposta. " +
    "Não se estenda no pedido de desculpas nem explique o motivo: o cliente quer a resposta, não a justificativa."
  );
}

/**
 * O número caiu: as listas param e, se a queda durar, o limite recomeça
 * (0174 e 0176, 10/10/2026).
 *
 * O caso que criou esta regra: o WhatsApp restringiu o número da Bruna por
 * envio em massa em 07/10. No dia seguinte a lista dela mandou mais 50
 * mensagens, e o número caiu 1 minuto depois da última. A lista seguiu "em
 * andamento", com 113 na fila: ao reconectar, voltaria a sair no ritmo da
 * semana anterior, que pela regra do uso (0158) chegava a 75 por dia. Sair
 * do ar logo depois de um volume desses é o pior momento para retomar no
 * mesmo ritmo.
 *
 * Então:
 * - com 30 minutos fora do ar, as listas em andamento do corretor pausam,
 *   com o motivo escrito, e só ele retoma (depois de reconectar e olhar o
 *   celular);
 * - com 3 dias seguidos sem conectar, o limite diário passa a contar só os
 *   envios depois da queda: volta ao piso de 15 e sobe com o uso de novo
 *   (`limiteDoDia`, `recomecoDepoisDe`).
 *
 * Os 30 minutos separam a queda da oscilação: a Evolution reconecta sozinha
 * as quedas de rede em segundos.
 *
 * Os 3 dias são decisão do dono da conta (10/10/2026). Na 0174 o limite
 * recomeçava junto com a pausa, aos 30 minutos, e os números caem com
 * frequência: no mesmo dia, quatro dos seis estavam fora do ar (três com
 * 401, o aparelho desconectado da conta) e todos voltariam a 15. Quem
 * reconecta antes de 3 dias volta no ritmo que tinha, como `trocaDeNumero.ts`
 * já faz ao reconectar o mesmo número; o freio da queda curta é a pausa da
 * lista, porque retomar é decisão do corretor.
 *
 * As quedas que já existiam em 10/10 não pausaram lista nenhuma, por decisão
 * do dono da conta ("não pause as listas").
 *
 * Puro: quem aplica é `quedaDoNumero.ts`.
 */

import { DIAS_FORA_PARA_RECOMECAR, PISO_POR_USO } from "./antiBan";
import { quandoEmSaoPaulo } from "./saudeDaConexao";

/** Quanto tempo fora do ar até a queda pausar as listas (oscilação não conta). */
export const MINUTOS_PARA_A_QUEDA_CONTAR = 30;

export interface FotoDaQueda {
  statusConexao: string;
  /** Primeira conexão do número. Sem ela, nunca houve número no ar para cair. */
  conectadoEm: Date | null;
  /** Marco da queda atual. */
  desconectadoEm: Date | null;
  /** Quando as listas foram pausadas por queda pela última vez. */
  quedaTratadaEm: Date | null;
  /** Começo da última queda que recomeçou o limite. */
  aquecimentoDesde: Date | null;
}

/** A queda atual pede a pausa das listas (e ainda não a recebeu)? */
export function quedaPedePausa(f: FotoDaQueda, agora: Date): boolean {
  if (f.statusConexao === "conectado") return false;
  if (!f.conectadoEm || !f.desconectadoEm) return false;
  if (agora.getTime() - f.desconectadoEm.getTime() < MINUTOS_PARA_A_QUEDA_CONTAR * 60_000) return false;
  return !f.quedaTratadaEm || f.quedaTratadaEm.getTime() < f.desconectadoEm.getTime();
}

/**
 * A queda atual passou de 3 dias sem conectar e o limite ainda não
 * recomeçou por ela? O marco gravado é o começo da queda: igual ao começo da
 * queda atual quer dizer que esta já foi contada.
 */
export function quedaPedeRecomeco(f: FotoDaQueda, agora: Date): boolean {
  if (f.statusConexao === "conectado") return false;
  if (!f.conectadoEm || !f.desconectadoEm) return false;
  if (agora.getTime() - f.desconectadoEm.getTime() < DIAS_FORA_PARA_RECOMECAR * 86_400_000) return false;
  return !f.aquecimentoDesde || f.aquecimentoDesde.getTime() < f.desconectadoEm.getTime();
}

/** O motivo da queda atual ainda não foi consultado na Evolution? */
export function motivoAindaNaoConsultado(f: {
  statusConexao: string;
  desconectadoEm: Date | null;
  motivoQuedaEm: Date | null;
}): boolean {
  if (f.statusConexao === "conectado" || !f.desconectadoEm) return false;
  return !f.motivoQuedaEm || f.motivoQuedaEm.getTime() < f.desconectadoEm.getTime();
}

/**
 * O texto que a lista pausada mostra. Diz quando caiu, por quê (se o
 * WhatsApp disse) e o que acontece com o limite, para retomar ser decisão
 * informada e não um clique para fazer o aviso sumir. A pausa sai aos 30
 * minutos, quando ainda não se sabe se a queda vai passar de 3 dias: por
 * isso o limite aparece como condição.
 */
export function motivoDaPausaPorQueda(desconectadoEm: Date, motivo: string | null): string {
  return (
    `Pausada sozinha: o número caiu em ${quandoEmSaoPaulo(desconectadoEm)}` +
    (motivo ? ` (${motivo})` : "") +
    ". Reconecte e confira o celular antes de retomar. " +
    `Se ele passar ${DIAS_FORA_PARA_RECOMECAR} dias ou mais sem conectar, o limite volta a ` +
    `${PISO_POR_USO} mensagens por dia e sobe de novo conforme o número é usado.`
  );
}

/** O dia de São Paulo (AAAA-MM-DD) de um instante: é a unidade do histórico de envios. */
export function diaDaQueda(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(instante);
}

/**
 * O número caiu: as listas param e o aquecimento recomeça (0174, 10/10/2026).
 *
 * O caso que criou esta regra: o WhatsApp restringiu o número da Bruna por
 * envio em massa em 07/10. No dia seguinte a lista dela mandou mais 50
 * mensagens, e o número caiu 1 minuto depois da última. A lista seguiu "em
 * andamento", com 113 na fila: ao reconectar, voltaria a sair no ritmo da
 * semana anterior, que pela regra do uso (0158) chegava a 75 por dia. Sair
 * do ar logo depois de um volume desses é o pior momento para retomar no
 * mesmo ritmo.
 *
 * Então, quando o número fica fora do ar por 30 minutos:
 * - as listas em andamento do corretor pausam, com o motivo escrito, e só ele
 *   retoma (depois de reconectar e olhar o celular);
 * - o limite diário passa a contar só os envios depois da queda: volta ao
 *   piso de 15 e sobe com o uso de novo (`limiteDoDia`, `recomecoDepoisDe`).
 *
 * Os 30 minutos separam a queda da oscilação: a Evolution reconecta sozinha
 * as quedas de rede em segundos, e perder a maturidade do número por causa de
 * um soluço de internet seria castigar o número à toa (a mesma régua de
 * `trocaDeNumero.ts`, que não zera nada ao reconectar o mesmo número).
 *
 * As quedas que já existiam em 10/10 não pausaram lista nenhuma, por decisão
 * do dono da conta ("não pause as listas"): a migration as marcou como
 * tratadas e só recomeçou o aquecimento delas.
 *
 * Puro: quem aplica é `quedaDoNumero.ts`.
 */

import { PISO_POR_USO } from "./antiBan";
import { quandoEmSaoPaulo } from "./saudeDaConexao";

/** Quanto tempo fora do ar até a queda contar (oscilação não conta). */
export const MINUTOS_PARA_A_QUEDA_CONTAR = 30;

export interface FotoDaQueda {
  statusConexao: string;
  /** Primeira conexão do número. Sem ela, nunca houve número no ar para cair. */
  conectadoEm: Date | null;
  /** Marco da queda atual. */
  desconectadoEm: Date | null;
  /** Quando a proteção rodou pela última vez. */
  quedaTratadaEm: Date | null;
}

/** A queda atual pede a proteção (e ainda não a recebeu)? */
export function quedaPedeProtecao(f: FotoDaQueda, agora: Date): boolean {
  if (f.statusConexao === "conectado") return false;
  if (!f.conectadoEm || !f.desconectadoEm) return false;
  if (agora.getTime() - f.desconectadoEm.getTime() < MINUTOS_PARA_A_QUEDA_CONTAR * 60_000) return false;
  return !f.quedaTratadaEm || f.quedaTratadaEm.getTime() < f.desconectadoEm.getTime();
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
 * WhatsApp disse) e o que acontece ao retomar, para retomar ser decisão
 * informada e não um clique para fazer o aviso sumir.
 */
export function motivoDaPausaPorQueda(desconectadoEm: Date, motivo: string | null): string {
  return (
    `Pausada sozinha: o número caiu em ${quandoEmSaoPaulo(desconectadoEm)}` +
    (motivo ? ` (${motivo})` : "") +
    ". Reconecte e confira o celular antes de retomar. Ao retomar, a lista recomeça devagar: " +
    `até ${PISO_POR_USO} mensagens por dia, subindo conforme o número volta a ser usado.`
  );
}

/** O dia de São Paulo (AAAA-MM-DD) de um instante: é a unidade do histórico de envios. */
export function diaDaQueda(instante: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(instante);
}

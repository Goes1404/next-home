import { momentoEmSaoPaulo } from "@/lib/whatsapp/antiBan";
import type { EtapaFunil } from "@/lib/types";

/**
 * O que o cartão de abertura do Início diz — em função pura, testável.
 *
 * ## Saudação pela hora de SÃO PAULO
 *
 * O servidor da Vercel roda em UTC: às 21h de Brasília já é "amanhã" lá, e um
 * `new Date().getHours()` daria "bom dia" para quem está jantando. Esta
 * armadilha já mordeu o calendário do bot, a agenda de visitas, a cota de
 * imagens e o ciclo de vídeo — quinta vez que aparece; por isso reusa
 * `momentoEmSaoPaulo`, que já resolve, em vez de mais uma cópia.
 *
 * ## O medidor é "% da carteira em andamento"
 *
 * Dos contatos que ainda estão no caminho (tudo menos perdido), quantos já
 * saíram de "novo". É o número que muda quando o corretor trabalha: cada
 * primeiro contato feito sobe o ponteiro. Fechados contam como andamento —
 * andaram até o fim. Sem carteira, o medidor mostra 0 e a frase diz o porquê,
 * em vez de dividir por zero e inventar um percentual.
 */

export type Saudacao = "Bom dia" | "Boa tarde" | "Boa noite";

export function saudacaoDoDia(agora: Date = new Date()): Saudacao {
  const { hora } = momentoEmSaoPaulo(agora);
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export type ResumoDaCarteira = {
  /** Contatos no caminho (tudo menos perdido). */
  ativos: number;
  /** % dos ativos que saíram de "novo". 0 quando não há carteira. */
  emAndamentoPct: number;
  emConversa: number;
  visitas: number;
  fechados: number;
};

export function resumoDaCarteira(c: Partial<Record<EtapaFunil, number>>): ResumoDaCarteira {
  const n = (e: EtapaFunil) => Math.max(0, c[e] ?? 0);
  const novo = n("novo");
  const emConversa = n("primeiro_contato");
  const visitas = n("visita_agendada");
  const doc = n("documentacao");
  const fechados = n("fechado");
  const ativos = novo + emConversa + visitas + doc + fechados;
  const andaram = ativos - novo;
  return {
    ativos,
    emAndamentoPct: ativos === 0 ? 0 : Math.round((andaram / ativos) * 100),
    emConversa,
    visitas,
    fechados,
  };
}

/** A frase de apoio muda com o estado — frase fixa vira paisagem. */
export function fraseDoHero(r: ResumoDaCarteira): string {
  if (r.ativos === 0) return "Sua carteira começa no primeiro contato que chegar.";
  if (r.visitas > 0) return `${r.visitas === 1 ? "Uma visita marcada" : `${r.visitas} visitas marcadas`} — é onde o negócio acontece.`;
  if (r.emAndamentoPct < 50) return "Cada primeiro contato move o ponteiro.";
  return "Mais da metade da carteira já está em conversa.";
}

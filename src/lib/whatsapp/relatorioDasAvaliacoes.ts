/**
 * O relatório semanal das avaliações da IA, no WhatsApp do corretor
 * (29/09/2026).
 *
 * O 👍/👎 existia desde a 0040 e ninguém olhava de forma regular: as 13
 * avaliações da vida inteira só serviram porque alguém foi procurar. Toda
 * segunda de manhã, o corretor recebe o que ele mesmo marcou na semana,
 * com os 👎 agrupados por motivo e um exemplo de cada — é daí que sai a
 * próxima correção. Vai pelo WhatsApp porque o e-mail já foi descartado
 * como canal neste projeto.
 *
 * Parte pura: a janela de envio e o texto. A leitura do banco e o envio
 * moram em `crm/enviarRelatorioDasAvaliacoes.ts`.
 */
import { diaEmSP, horaEmSP, segundaEmSP } from "@/lib/crm/resumoDoDia";
import { MOTIVOS_DA_AVALIACAO, rotuloDoMotivo, type MotivoDaAvaliacao } from "./motivosDaAvaliacao";

/** Segunda de manhã, das 9h ao meio-dia de SP, uma vez por semana. */
export function horaDoRelatorioDasAvaliacoes(agora: Date, ultimoEnvio: string | null): boolean {
  if (!segundaEmSP(agora)) return false;
  const hora = horaEmSP(agora);
  if (hora < 9 || hora >= 12) return false;
  return ultimoEnvio !== diaEmSP(agora);
}

export type EntradaDoRelatorio = {
  nomeCorretor: string;
  /** Respostas que a IA deu na semana. */
  respostas: number;
  boas: number;
  ruins: number;
  porMotivo: Partial<Record<MotivoDaAvaliacao, number>>;
  /** 👎 sem motivo escolhido. */
  ruinsSemMotivo: number;
  /** Respostas que ninguém avaliou. */
  semAvaliacao: number;
  /** "Como você responderia" escritos na semana (0125). */
  correcoes: number;
  /** Um exemplo por motivo: o começo da resposta reprovada. */
  exemplos: { motivo: MotivoDaAvaliacao | null; trecho: string }[];
  urlPainel: string;
};

const corte = (t: string, n: number) => {
  const limpo = t.replace(/\s+/g, " ").trim();
  return limpo.length > n ? `${limpo.slice(0, n - 1)}…` : limpo;
};

/**
 * O texto do relatório, ou null quando não há nada a dizer (semana sem
 * resposta da IA). Relatório vazio toda semana ensina a ignorar o relatório.
 */
export function montarRelatorioDasAvaliacoes(e: EntradaDoRelatorio): string | null {
  if (e.respostas === 0) return null;

  const primeiroNome = e.nomeCorretor.trim().split(/\s+/)[0] || e.nomeCorretor;
  const linhas: string[] = [
    `*Como a IA foi nesta semana*, ${primeiroNome}`,
    "",
    `Ela respondeu *${e.respostas}* ${e.respostas === 1 ? "vez" : "vezes"}. Você marcou 👍 ${e.boas} e 👎 ${e.ruins}.`,
  ];

  const motivos = MOTIVOS_DA_AVALIACAO.map((m) => ({ ...m, n: e.porMotivo[m.valor] ?? 0 })).filter((m) => m.n > 0);
  if (motivos.length > 0 || e.ruinsSemMotivo > 0) {
    linhas.push("", "*O que ficou ruim:*");
    for (const m of motivos.sort((a, b) => b.n - a.n)) linhas.push(`— ${m.rotulo}: ${m.n}`);
    if (e.ruinsSemMotivo > 0) linhas.push(`— Sem motivo marcado: ${e.ruinsSemMotivo}`);
  }

  if (e.exemplos.length > 0) {
    linhas.push("", "*Exemplos:*");
    for (const ex of e.exemplos.slice(0, 3)) linhas.push(`— (${rotuloDoMotivo(ex.motivo)}) "${corte(ex.trecho, 120)}"`);
  }

  if (e.correcoes > 0) {
    linhas.push(
      "",
      `Você ensinou ${e.correcoes} ${e.correcoes === 1 ? "resposta" : "respostas"} para a IA. Ela já usa nas conversas parecidas.`,
    );
  }

  if (e.semAvaliacao > 0) {
    linhas.push(
      "",
      `${e.semAvaliacao} ${e.semAvaliacao === 1 ? "resposta ficou" : "respostas ficaram"} sem avaliação. Um 👍 ou 👎 em cada uma ajuda a IA a acertar o seu jeito.`,
    );
  }

  linhas.push("", `Revisar: ${e.urlPainel}/corretor/conversas`);
  return linhas.join("\n");
}

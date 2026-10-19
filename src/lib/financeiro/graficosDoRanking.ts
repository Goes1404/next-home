import { NOMES_MES } from "./painelDeVendas";

/**
 * Os gráficos do Ranking (07/10/2026), em função pura. Só usam o que o
 * ranking já mostra a todos (VGV, vendas, posição): nada aqui pode depender
 * de dado que a função do banco esconde.
 */

export type LinhaDoRankingGrafico = { corretorId: string; nome: string; fotoUrl: string | null; vgv: number; vendas: number };

/** Os três primeiros na ordem do pódio: 2º, 1º, 3º. Menos de três, só os que há. */
export function ordemDoPodio<T extends LinhaDoRankingGrafico>(lideres: T[]): { linha: T; posicao: number }[] {
  const top = lideres.filter((l) => l.vgv > 0).slice(0, 3);
  const ordem = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : top.map((_, i) => i);
  return ordem.map((i) => ({ linha: top[i], posicao: i + 1 }));
}

export type FatiaDoCorretor = {
  total: number;
  meu: number;
  /** % do VGV da equipe que é meu; null sem VGV na equipe. */
  porcentagem: number | null;
  posicao: number | null;
  /** Quem está logo acima e quanto falta para passar (VGV + 1 centavo não conta: empate perde por vendas). */
  acima: { nome: string; falta: number } | null;
  /** Quem vem logo atrás e a vantagem. */
  abaixo: { nome: string; vantagem: number } | null;
};

export function fatiaDoCorretor(lideres: LinhaDoRankingGrafico[], eu: string): FatiaDoCorretor {
  const comVgv = lideres.filter((l) => l.vgv > 0);
  const total = comVgv.reduce((s, l) => s + l.vgv, 0);
  const i = comVgv.findIndex((l) => l.corretorId === eu);
  const meu = i >= 0 ? comVgv[i].vgv : 0;
  return {
    total,
    meu,
    porcentagem: total > 0 ? Math.round((meu / total) * 100) : null,
    posicao: i >= 0 ? i + 1 : null,
    acima:
      i > 0
        ? { nome: comVgv[i - 1].nome, falta: comVgv[i - 1].vgv - meu }
        : i < 0 && comVgv.length > 0
          ? { nome: comVgv[comVgv.length - 1].nome, falta: comVgv[comVgv.length - 1].vgv }
          : null,
    abaixo: i >= 0 && i < comVgv.length - 1 ? { nome: comVgv[i + 1].nome, vantagem: meu - comVgv[i + 1].vgv } : null,
  };
}

export type MesDaEvolucao = { mes: string; rotulo: string; valor: number; posicao: number | null; participantes: number };

/** VGV e posição do corretor em cada mês, a partir do ranking de cada mês. */
export function evolucaoNoRanking(
  meses: { mes: string; ranking: LinhaDoRankingGrafico[] }[],
  eu: string,
): MesDaEvolucao[] {
  return meses.map(({ mes, ranking }) => {
    const comVgv = ranking.filter((l) => l.vgv > 0);
    const i = comVgv.findIndex((l) => l.corretorId === eu);
    return {
      mes,
      rotulo: NOMES_MES[Number(mes.slice(5, 7)) - 1],
      valor: i >= 0 ? comVgv[i].vgv : 0,
      posicao: i >= 0 ? i + 1 : null,
      participantes: comVgv.length,
    };
  });
}

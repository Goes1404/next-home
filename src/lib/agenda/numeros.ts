import { mesVizinho, type Mes } from "./calendario";

/**
 * Os números da Agenda do gestor (0225): por mês de São Paulo, contados no
 * banco (`numeros_da_agenda`). Aqui só a montagem da série de 6 meses.
 *
 * Os números começam do zero no mês em que a Agenda entrou no ar: mês antes
 * disso é "não medido", e a tela diz isso em vez de mostrar zero como se
 * tivesse sido medido.
 */
export type NumerosDoMes = {
  mes: Mes;
  marcadas: number;
  realizadas: number;
  faltas: number;
  semConfirmacao: number;
  negocios: number;
};

export type MesDaSerie = ({ medido: true } & NumerosDoMes) | { medido: false; mes: Mes };

/** Janela da comparação: o mês escolhido e os cinco anteriores. */
export const MESES_DA_SERIE = 6;

export function mesesAteh(ate: Mes, quantos: number): Mes[] {
  const meses = [ate];
  while (meses.length < quantos) meses.unshift(mesVizinho(meses[0], -1));
  return meses;
}

export function montarSerie(linhas: NumerosDoMes[], meses: Mes[], medidaDesde: Mes | null): MesDaSerie[] {
  const porMes = new Map(linhas.map((l) => [l.mes, l]));
  return meses.map((mes): MesDaSerie => {
    if (!medidaDesde || mes < medidaDesde) return { medido: false, mes };
    return {
      medido: true,
      ...(porMes.get(mes) ?? { mes, marcadas: 0, realizadas: 0, faltas: 0, semConfirmacao: 0, negocios: 0 }),
    };
  });
}

/** "+2", "−1", "igual"; null quando não há mês anterior medido. */
export function variacao(atual: number, anterior: number | null): string | null {
  if (anterior === null) return null;
  const d = atual - anterior;
  if (d === 0) return "igual";
  return d > 0 ? `+${d}` : `−${-d}`;
}

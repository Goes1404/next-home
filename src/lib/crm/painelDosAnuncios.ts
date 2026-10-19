/**
 * O painel de indicadores da tela de Anúncios pagos (07/10/2026), no estilo
 * de um Power BI: período e canal escolhidos em cima, e tudo abaixo (números,
 * gráficos e funil) recalculado pelo filtro. Módulo PURO: roda no navegador a
 * cada clique, sem ir ao banco.
 *
 * Duas regras que vêm da tela de baixo e valem aqui também:
 * - o gasto de um período é o que o corretor registrou distribuído pelos dias
 *   (`gastoAte`), não o total da campanha jogado num dia só;
 * - custo e contagem usam a MESMA população: só clientes de campanha com valor
 *   informado entram no "custo por"; os outros aparecem à parte.
 */
import {
  degrauDoCliente,
  gastoAte,
  ROTULO_CANAL_DO_GRAFICO,
  type CanalDoGrafico,
  type LeadDeAnuncio,
  type LinhaImpulsionamento,
  type PontoDeGasto,
  type ResumoImpulsionamento,
} from "./impulsionamentosCalculo";

/** A ordem fixa dos canais: é ela que dá a cor e a ordem de empilhamento. */
export const ORDEM_DOS_CANAIS: CanalDoGrafico[] = ["instagram", "facebook", "google", "portal", "meta", "outro"];

export type ClienteDoPainel = {
  canal: CanalDoGrafico;
  /** Dia em que o cliente chegou, "aaaa-mm-dd" (São Paulo). */
  dia: string;
  degrau: 0 | 1 | 2 | 3 | 4;
  saiu: boolean;
  /** Veio de campanha com valor informado (entra no custo). */
  comGasto: boolean;
};

export type LinhaDeGasto = { linha: LinhaImpulsionamento; canal: CanalDoGrafico };

export type DadosDoPainel = {
  clientes: ClienteDoPainel[];
  linhas: LinhaDeGasto[];
  pontos: PontoDeGasto[];
  hoje: string;
};

export type Periodo = 30 | 90 | 180 | "tudo";
export type Filtro = { periodo: Periodo; canal: CanalDoGrafico | null };

const DIA_MS = 86_400_000;
const emMs = (dia: string) => Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10));
const deMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const somarDias = (dia: string, n: number) => deMs(emMs(dia) + n * DIA_MS);

function diaSP(iso: string): string {
  if (iso.length === 10) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** Monta os dados do painel a partir do que a página já calculou. */
export function montarDadosDoPainel(
  resumos: ResumoImpulsionamento[],
  leads: LeadDeAnuncio[],
  pontos: PontoDeGasto[],
  hoje: string,
): DadosDoPainel {
  const porId = new Map(leads.filter((l) => l.id).map((l) => [l.id as string, l]));
  const clientes: ClienteDoPainel[] = [];
  const linhas: LinhaDeGasto[] = [];
  for (const r of resumos) {
    const canal: CanalDoGrafico = r.canal ?? "meta";
    const comGasto = r.gastoTotal !== null;
    for (const id of r.leadIds) {
      const l = porId.get(id);
      if (!l || !l.criadoEm) continue;
      clientes.push({
        canal,
        dia: diaSP(l.criadoEm),
        degrau: degrauDoCliente(l),
        saiu: Boolean(l.pediuParaSair) || l.etapa === "perdido",
        comGasto,
      });
    }
    if (comGasto) for (const linha of [r, ...r.anuncios]) linhas.push({ linha, canal });
  }
  return { clientes, linhas, pontos, hoje };
}

export type Janela = { de: string; ate: string; anterior: { de: string; ate: string } | null; dias: number };

/** O período escolhido e o anterior de mesmo tamanho ("tudo" não compara). */
export function janelaDo(dados: DadosDoPainel, periodo: Periodo): Janela {
  const ate = dados.hoje;
  if (periodo === "tudo") {
    const inicios = [
      ...dados.clientes.map((c) => c.dia),
      ...dados.linhas.map((l) => l.linha.inicio ?? diaSP(l.linha.primeiroLeadEm)),
    ];
    const de = inicios.length > 0 ? inicios.reduce((a, b) => (a < b ? a : b)) : somarDias(ate, -29);
    return { de, ate, anterior: null, dias: Math.round((emMs(ate) - emMs(de)) / DIA_MS) + 1 };
  }
  const de = somarDias(ate, -(periodo - 1));
  return { de, ate, anterior: { de: somarDias(de, -periodo), ate: somarDias(de, -1) }, dias: periodo };
}

/** Gasto entre dois dias, inclusive, distribuído como `gastoAte` faz. */
export function gastoEntre(dados: DadosDoPainel, de: string, ate: string, canal: CanalDoGrafico | null): number {
  let total = 0;
  for (const { linha, canal: c } of dados.linhas) {
    if (canal && c !== canal) continue;
    total += gastoAte(linha, dados.pontos, ate, dados.hoje) - gastoAte(linha, dados.pontos, somarDias(de, -1), dados.hoje);
  }
  return Math.max(0, Math.round(total * 100) / 100);
}

export type Indicadores = {
  gasto: number;
  clientes: number;
  conversaram: number;
  qualificados: number;
  visitas: number;
  fechados: number;
  sairam: number;
  /** Clientes de campanha sem valor informado (fora do custo). */
  clientesSemGasto: number;
  custoPorCliente: number | null;
  custoPorQualificado: number | null;
  custoPorVisita: number | null;
};

const dividir = (v: number, por: number) => (por > 0 && v > 0 ? Math.round((v / por) * 100) / 100 : null);

export function indicadoresEntre(dados: DadosDoPainel, de: string, ate: string, canal: CanalDoGrafico | null): Indicadores {
  const doRecorte = dados.clientes.filter((c) => c.dia >= de && c.dia <= ate && (!canal || c.canal === canal));
  const comGasto = doRecorte.filter((c) => c.comGasto);
  const conta = (lista: ClienteDoPainel[], min: number) => lista.filter((c) => c.degrau >= min).length;
  const gasto = gastoEntre(dados, de, ate, canal);
  return {
    gasto,
    clientes: doRecorte.length,
    conversaram: conta(doRecorte, 1),
    qualificados: conta(doRecorte, 2),
    visitas: conta(doRecorte, 3),
    fechados: conta(doRecorte, 4),
    sairam: doRecorte.filter((c) => c.saiu).length,
    clientesSemGasto: doRecorte.length - comGasto.length,
    custoPorCliente: dividir(gasto, comGasto.length),
    custoPorQualificado: dividir(gasto, conta(comGasto, 2)),
    custoPorVisita: dividir(gasto, conta(comGasto, 3)),
  };
}

/** Variação em % do atual sobre o anterior; null sem base para comparar. */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

export type Semana = {
  /** Último dia da semana. */
  fim: string;
  clientes: number;
  porCanal: Partial<Record<CanalDoGrafico, number>>;
  gasto: number;
  visitas: number;
  custoPorCliente: number | null;
};

/** Semanas terminando em `ate`, cobrindo a janela (no máximo 26). */
export function semanasDa(dados: DadosDoPainel, janela: Janela, canal: CanalDoGrafico | null): Semana[] {
  const quantas = Math.min(26, Math.max(4, Math.ceil(janela.dias / 7)));
  const semanas: Semana[] = [];
  for (let i = quantas - 1; i >= 0; i--) {
    const fim = somarDias(janela.ate, -7 * i);
    const inicio = somarDias(fim, -6);
    const ind = indicadoresEntre(dados, inicio, fim, canal);
    const porCanal: Semana["porCanal"] = {};
    for (const c of dados.clientes) {
      if (c.dia < inicio || c.dia > fim || (canal && c.canal !== canal)) continue;
      porCanal[c.canal] = (porCanal[c.canal] ?? 0) + 1;
    }
    semanas.push({ fim, clientes: ind.clientes, porCanal, gasto: ind.gasto, visitas: ind.visitas, custoPorCliente: ind.custoPorCliente });
  }
  return semanas;
}

export type FatiaDoCanal = { canal: CanalDoGrafico; rotulo: string; gasto: number; clientes: number; visitas: number; custoPorCliente: number | null };

/** Gasto e clientes por canal no período (todos os canais, para a pizza poder filtrar). */
export function canaisDoPeriodo(dados: DadosDoPainel, janela: Janela): FatiaDoCanal[] {
  return ORDEM_DOS_CANAIS.map((canal) => {
    const ind = indicadoresEntre(dados, janela.de, janela.ate, canal);
    return { canal, rotulo: ROTULO_CANAL_DO_GRAFICO[canal], gasto: ind.gasto, clientes: ind.clientes, visitas: ind.visitas, custoPorCliente: ind.custoPorCliente };
  }).filter((f) => f.gasto > 0 || f.clientes > 0);
}

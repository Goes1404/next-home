// O painel de números da Astro no topo de `/plataforma` (29/10/2026).
//
// Módulo PURO: recebe a lista de contas que a página já leu (`ResumoDeGrupo`,
// com a cobrança e a cota calculadas pelas MESMAS contas do webhook) e o custo
// da IA de `saude.ts`, e devolve os indicadores. Nenhuma consulta nova para
// somar: o que custa (contar leads, ler logins) mora em `atividade.ts`.
//
// As regras (29/10/2026):
//
// - receita mensal recorrente: soma de `mensalidade` das contas ATIVAS
//   (`situacao = 'ativo'`), fora o plano `custo` (a Next Home, que nunca é
//   cobrada). Conta suspensa por atraso continua ativa no contrato e entra;
//   a suspensa à mão e a cancelada não. Não há período de teste no banco
//   (nenhuma coluna `teste_ate`): quando houver, a conta em teste sai daqui;
// - canceladas: `situacao = 'encerrado'` (o cancelamento grava isso, 0202);
// - mensalidade em aberto: conta não cancelada com a cobrança `pendente` ou
//   `suspenso` (vencida e não paga). O valor é UMA mensalidade por conta (a
//   competência mais antiga); meses a mais aparecem na tela da conta;
// - sem uso há 7 dias: decidido em `atividade.ts` (nenhum lead criado e
//   nenhum login da equipe em 7 dias); aqui só entra o conjunto.

import { diaEmSP } from "@/lib/crm/resumoDoDia";
import type { ResumoDeGrupo } from "./grupos";

export type ContaDoPainel = Pick<
  ResumoDeGrupo,
  "id" | "tipo" | "plano" | "situacao" | "criadoEm" | "mensalidade" | "cobranca" | "usoDaIa"
>;

export type MesDoPainel = { mes: string; rotulo: string; total: number };

export type PainelDeNumeros = {
  receitaMensal: number;
  /** Quantas contas entram na receita. */
  pagantes: number;
  ativas: number;
  suspensas: number;
  canceladas: number;
  emAberto: { contas: number; valor: number };
  /** `null` = não deu para medir (a leitura falhou; a tela diz isso). */
  semUso: number | null;
  ia: { respostas: number; custoBrl: number; contasEmAlerta: number };
  /** Contas novas nos últimos 6 meses, do mais antigo ao atual. */
  novasPorMes: MesDoPainel[];
};

export const MESES_NA_TENDENCIA = 6;

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** `AAAA-MM` de uma data, no fuso de São Paulo. */
export function mesDaData(data: Date): string {
  return diaEmSP(data).slice(0, 7);
}

/** Os `n` meses (`AAAA-MM`) que terminam no mês de `agora`, do mais antigo ao atual. */
export function ultimosMeses(agora: Date, n: number = MESES_NA_TENDENCIA): string[] {
  const [ano, mes] = mesDaData(agora).split("-").map(Number);
  const saida: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    saida.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return saida;
}

export function ehPagante(g: Pick<ContaDoPainel, "situacao" | "plano" | "mensalidade">): boolean {
  return g.situacao === "ativo" && g.plano !== "custo" && g.mensalidade !== null && g.mensalidade > 0;
}

export function temMensalidadeEmAberto(g: Pick<ContaDoPainel, "situacao" | "cobranca">): boolean {
  return g.situacao !== "encerrado" && (g.cobranca.estado === "pendente" || g.cobranca.estado === "suspenso");
}

/** IA perto do teto (ou esgotada) ou custo acima de 30% da mensalidade. */
export function iaEmAlerta(g: Pick<ContaDoPainel, "usoDaIa">, custoEmAlerta: boolean): boolean {
  return g.usoDaIa.nivel === "aviso" || g.usoDaIa.nivel === "esgotada" || custoEmAlerta;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

export function calcularPainel(p: {
  contas: readonly ContaDoPainel[];
  /** Custo da IA no mês por conta (`saude.ts`): reais e o alerta de 30%. */
  custos: Record<string, { custoBrl: number; alerta: boolean } | undefined>;
  semUso: ReadonlySet<string> | null;
  agora: Date;
}): PainelDeNumeros {
  const { contas, custos, semUso, agora } = p;
  const pagantes = contas.filter(ehPagante);
  const abertas = contas.filter(temMensalidadeEmAberto);
  const meses = ultimosMeses(agora);
  const porMes = new Map(meses.map((m) => [m, 0]));
  for (const g of contas) {
    const m = mesDaData(new Date(g.criadoEm));
    if (porMes.has(m)) porMes.set(m, porMes.get(m)! + 1);
  }
  return {
    receitaMensal: centavos(pagantes.reduce((s, g) => s + (g.mensalidade ?? 0), 0)),
    pagantes: pagantes.length,
    ativas: contas.filter((g) => g.situacao === "ativo").length,
    suspensas: contas.filter((g) => g.situacao === "suspenso").length,
    canceladas: contas.filter((g) => g.situacao === "encerrado").length,
    emAberto: { contas: abertas.length, valor: centavos(abertas.reduce((s, g) => s + (g.mensalidade ?? 0), 0)) },
    semUso: semUso === null ? null : contas.filter((g) => g.situacao !== "encerrado" && semUso.has(g.id)).length,
    ia: {
      respostas: contas.reduce((s, g) => s + g.usoDaIa.respostas, 0),
      custoBrl: centavos(contas.reduce((s, g) => s + (custos[g.id]?.custoBrl ?? 0), 0)),
      contasEmAlerta: contas.filter((g) => g.situacao !== "encerrado" && iaEmAlerta(g, custos[g.id]?.alerta ?? false)).length,
    },
    novasPorMes: meses.map((mes) => ({ mes, rotulo: MES_CURTO[Number(mes.slice(5)) - 1], total: porMes.get(mes) ?? 0 })),
  };
}

// ── O filtro da lista pelos indicadores (`?ver=`) ──────────────────────────

export const FILTROS_DE_INDICADOR = {
  pagantes: "Pagantes",
  ativas: "Ativas",
  suspensas: "Suspensas",
  canceladas: "Canceladas",
  "em-aberto": "Mensalidade em aberto",
  "sem-uso": "Sem uso há 7 dias",
  ia: "IA em alerta",
} as const;

export type FiltroDeIndicador = keyof typeof FILTROS_DE_INDICADOR;

/** O `?ver=` da URL; valor desconhecido = sem filtro (`null`). */
export function lerFiltroDeIndicador(valor: string | string[] | undefined): FiltroDeIndicador | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v !== undefined && Object.hasOwn(FILTROS_DE_INDICADOR, v) ? (v as FiltroDeIndicador) : null;
}

/** O link da lista com o tipo e o indicador (os dois filtros convivem). */
export function hrefDaLista(p: { tipo?: string; ver?: FiltroDeIndicador | null }): string {
  const busca = new URLSearchParams();
  if (p.tipo && p.tipo !== "todos") busca.set("tipo", p.tipo);
  if (p.ver) busca.set("ver", p.ver);
  const texto = busca.toString();
  return texto ? `/plataforma?${texto}#contas` : "/plataforma#contas";
}

export function filtrarPorIndicador<T extends ContaDoPainel>(
  contas: readonly T[],
  filtro: FiltroDeIndicador | null,
  extras: { semUso: ReadonlySet<string> | null; custos: Record<string, { alerta: boolean } | undefined> },
): T[] {
  switch (filtro) {
    case null:
      return [...contas];
    case "pagantes":
      return contas.filter(ehPagante);
    case "ativas":
      return contas.filter((g) => g.situacao === "ativo");
    case "suspensas":
      return contas.filter((g) => g.situacao === "suspenso");
    case "canceladas":
      return contas.filter((g) => g.situacao === "encerrado");
    case "em-aberto":
      return contas.filter(temMensalidadeEmAberto);
    case "sem-uso":
      return contas.filter((g) => g.situacao !== "encerrado" && (extras.semUso?.has(g.id) ?? false));
    case "ia":
      return contas.filter((g) => g.situacao !== "encerrado" && iaEmAlerta(g, extras.custos[g.id]?.alerta ?? false));
  }
}

// ── Sem uso há 7 dias ─────────────────────────────────────────────────────

export const DIAS_SEM_USO = 7;

/**
 * Conta sem uso: nenhum lead criado E nenhum login da equipe nos últimos 7
 * dias. Um dos dois basta para a conta estar viva (a imobiliária que só
 * recebe lead pelo site e ninguém entra também é problema, mas é outro: o
 * lead parado, que a saúde da conta já mostra).
 */
export function contaSemUso(p: { leadsNosUltimosDias: number; ultimoLoginDaEquipe: string | null; agora: Date }): boolean {
  if (p.leadsNosUltimosDias > 0) return false;
  if (p.ultimoLoginDaEquipe === null) return true;
  return p.agora.getTime() - new Date(p.ultimoLoginDaEquipe).getTime() > DIAS_SEM_USO * 86_400_000;
}

/** O login mais recente de uma lista (ISO), ou `null`. */
export function maisRecente(datas: readonly (string | null | undefined)[]): string | null {
  let melhor: string | null = null;
  for (const d of datas) {
    if (!d) continue;
    if (melhor === null || new Date(d).getTime() > new Date(melhor).getTime()) melhor = d;
  }
  return melhor;
}

// ── A tendência em SVG (sem biblioteca de gráfico) ─────────────────────────

/**
 * Os pontos da linha da tendência num quadro `largura` × `altura`, com
 * `margem` em volta para o círculo do último ponto não cortar. Tudo zero vira
 * linha no chão.
 */
export function pontosDaTendencia(valores: readonly number[], largura: number, altura: number, margem = 3): { x: number; y: number }[] {
  if (valores.length === 0) return [];
  const maximo = Math.max(...valores, 0);
  const passo = valores.length === 1 ? 0 : (largura - 2 * margem) / (valores.length - 1);
  return valores.map((v, i) => ({
    x: Math.round((margem + i * passo) * 10) / 10,
    y: Math.round((altura - margem - (maximo === 0 ? 0 : (v / maximo) * (altura - 2 * margem))) * 10) / 10,
  }));
}

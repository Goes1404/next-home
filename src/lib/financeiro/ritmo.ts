import { centavos } from "./venda";

/**
 * A meta traduzida em trabalho (F5 do financeiro).
 *
 * O corretor diz quanto quer ganhar no mês; a plataforma responde em
 * vendas, visitas e atendimentos, pela conversão DELE. É o número que o faz
 * abrir o app de manhã: "faltam 2 vendas" é uma tarefa, "faltam R$ 9 mil"
 * é só uma preocupação.
 *
 * ## De onde vem cada taxa, e por que a tela diz
 *
 * Três fontes, nesta ordem: o histórico dele, a média da equipe, e nada.
 * Cada uma só vale com AMOSTRA MÍNIMA — "1 visita, 1 venda" daria 100% de
 * conversão e a meta pareceria fácil demais. Sem amostra em lugar nenhum a
 * conta PARA no degrau que dá para afirmar (vendas) e diz o porquê, em vez
 * de inventar uma taxa de referência que ninguém mediu.
 */

export type FonteDaTaxa = "suas" | "equipe";

export type Taxa = { valor: number; fonte: FonteDaTaxa; amostra: number };

export type Contagem = { sucessos: number; tentativas: number };

/** Amostra mínima para uma taxa ser dita em voz alta. */
export const AMOSTRA_MINIMA = { leadParaVisita: 15, visitaParaVenda: 5 } as const;

export function escolherTaxa(propria: Contagem, equipe: Contagem | null, minimo: number): Taxa | null {
  const valida = (c: Contagem | null) => c && c.tentativas >= minimo && c.sucessos > 0;
  if (valida(propria)) return { valor: propria.sucessos / propria.tentativas, fonte: "suas", amostra: propria.tentativas };
  if (equipe && valida(equipe)) return { valor: equipe.sucessos / equipe.tentativas, fonte: "equipe", amostra: equipe.tentativas };
  return null;
}

export type FonteDaComissao = "suas_vendas" | "sua_estimativa" | "equipe";

export type ComissaoPorVenda = { valor: number; fonte: FonteDaComissao };

export function escolherComissaoPorVenda(params: {
  mediaPropria: number | null;
  vendasProprias: number;
  estimativa: number | null;
  mediaEquipe: number | null;
}): ComissaoPorVenda | null {
  // Duas vendas já dizem mais que um palpite; uma só é sorte.
  if (params.mediaPropria && params.vendasProprias >= 2) return { valor: params.mediaPropria, fonte: "suas_vendas" };
  if (params.estimativa) return { valor: params.estimativa, fonte: "sua_estimativa" };
  if (params.mediaEquipe) return { valor: params.mediaEquipe, fonte: "equipe" };
  if (params.mediaPropria) return { valor: params.mediaPropria, fonte: "suas_vendas" };
  return null;
}

export type Ritmo = {
  meta: number;
  ganho: number;
  falta: number;
  atingida: boolean;
  /** 0 a 1, para a barra. */
  progresso: number;
  vendas: number | null;
  visitas: number | null;
  atendimentos: number | null;
  /** Atendimentos por semana até o fim do mês (quando dá para calcular). */
  atendimentosPorSemana: number | null;
  comissaoPorVenda: ComissaoPorVenda | null;
  visitaParaVenda: Taxa | null;
  leadParaVisita: Taxa | null;
  diasRestantes: number;
};

export function calcularRitmo(params: {
  meta: number;
  ganhoNoMes: number;
  comissaoPorVenda: ComissaoPorVenda | null;
  visitaParaVenda: Taxa | null;
  leadParaVisita: Taxa | null;
  diasRestantes: number;
}): Ritmo {
  const falta = centavos(Math.max(0, params.meta - params.ganhoNoMes));
  const atingida = falta === 0;
  const vendas =
    atingida ? 0 : params.comissaoPorVenda ? Math.ceil(falta / params.comissaoPorVenda.valor) : null;
  const visitas = vendas === null ? null : params.visitaParaVenda ? Math.ceil(vendas / params.visitaParaVenda.valor) : null;
  const atendimentos = visitas === null ? null : params.leadParaVisita ? Math.ceil(visitas / params.leadParaVisita.valor) : null;
  const semanas = Math.max(1, params.diasRestantes / 7);

  return {
    meta: params.meta,
    ganho: params.ganhoNoMes,
    falta,
    atingida,
    progresso: params.meta > 0 ? Math.min(1, params.ganhoNoMes / params.meta) : 0,
    vendas,
    visitas,
    atendimentos,
    atendimentosPorSemana: atendimentos === null ? null : Math.ceil(atendimentos / semanas),
    comissaoPorVenda: params.comissaoPorVenda,
    visitaParaVenda: params.visitaParaVenda,
    leadParaVisita: params.leadParaVisita,
    diasRestantes: params.diasRestantes,
  };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A frase do topo do cartão — o que falta, em trabalho. */
export function fraseDoRitmo(r: Ritmo): string {
  if (r.atingida) return "Meta do mês batida. Tudo o que vier agora é a mais.";
  if (r.vendas === null) return "Registre uma venda ou diga quanto costuma ganhar por venda para eu calcular o caminho.";
  const partes = [plural(r.vendas, "venda", "vendas")];
  if (r.visitas !== null) partes.push(plural(r.visitas, "visita", "visitas"));
  if (r.atendimentos !== null) partes.push(plural(r.atendimentos, "atendimento", "atendimentos"));
  return `Faltam ${partes.join(", que pedem ")}.`;
}

export const ROTULO_FONTE_TAXA: Record<FonteDaTaxa, string> = {
  suas: "pelo seu histórico",
  equipe: "pela média da equipe",
};

export const ROTULO_FONTE_COMISSAO: Record<FonteDaComissao, string> = {
  suas_vendas: "média das suas vendas",
  sua_estimativa: "a sua estimativa",
  equipe: "média da equipe",
};

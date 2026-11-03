/**
 * A medição do piloto (F4 do roadmap): o que decide se o número oficial
 * escala. Puro: recebe as linhas, devolve os números. Quem lê o banco é
 * `metricasServidor.ts`.
 *
 * Só contagem e dinheiro, nunca texto de conversa: o gestor vê esta tela e
 * não lê conversa (0134).
 *
 * O custo tem duas fontes, e a tela diz qual está usando:
 *   - cobrado: o que a Meta disse no webhook (`pricing.billable`, por
 *     categoria), multiplicado pela tarifa conferida;
 *   - estimado: item enviado sem esse dado ainda (o webhook não chegou),
 *     contado como marketing.
 */

import type { CategoriaDeCobranca } from "./tarifas";

export type ItemDaMedicao = {
  status: "pendente" | "enviado" | "erro" | "respondido";
  leadId: string | null;
  enviadoEm: string | null;
  entregueEm: string | null;
  lidoEm: string | null;
  erroMotivo: string | null;
  cobrada: boolean | null;
  categoria: CategoriaDeCobranca | null;
};

export type ResumoDaLista = {
  enviadas: number;
  entregues: number;
  lidas: number;
  respondidas: number;
  pararam: number;
  visitas: number;
  pendentes: number;
  falhas: { motivo: string; total: number }[];
  custo: number;
  custoEstimado: boolean;
  custoPorResposta: number | null;
  custoPorVisita: number | null;
  taxaDeResposta: number | null;
};

export function resumirLista(
  itens: ItemDaMedicao[],
  extras: {
    /** Leads da lista que pediram para parar DEPOIS de receber. */
    pararam: Set<string>;
    /** Leads da lista com visita marcada DEPOIS de receber. */
    comVisita: Set<string>;
    tarifa: (categoria: CategoriaDeCobranca) => number;
  },
): ResumoDaLista {
  const saiu = itens.filter((i) => i.status === "enviado" || i.status === "respondido");
  const respondidas = itens.filter((i) => i.status === "respondido").length;
  const leadsQueReceberam = new Set(saiu.map((i) => i.leadId).filter((id): id is string => Boolean(id)));

  let custo = 0;
  let estimado = false;
  for (const i of saiu) {
    if (i.cobrada === false) continue;
    if (i.cobrada === true && i.categoria) {
      custo += extras.tarifa(i.categoria);
    } else {
      custo += extras.tarifa("marketing");
      estimado = true;
    }
  }

  const porMotivo = new Map<string, number>();
  for (const i of itens) {
    if (i.status !== "erro") continue;
    const motivo = i.erroMotivo?.trim() || "Sem motivo registrado";
    porMotivo.set(motivo, (porMotivo.get(motivo) ?? 0) + 1);
  }

  const pararam = [...extras.pararam].filter((id) => leadsQueReceberam.has(id)).length;
  const visitas = [...extras.comVisita].filter((id) => leadsQueReceberam.has(id)).length;

  return {
    enviadas: saiu.length,
    entregues: saiu.filter((i) => i.entregueEm).length,
    lidas: saiu.filter((i) => i.lidoEm).length,
    respondidas,
    pararam,
    visitas,
    pendentes: itens.filter((i) => i.status === "pendente").length,
    falhas: [...porMotivo.entries()]
      .map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5),
    custo: Math.round(custo * 100) / 100,
    custoEstimado: estimado,
    custoPorResposta: respondidas > 0 ? Math.round((custo / respondidas) * 100) / 100 : null,
    custoPorVisita: visitas > 0 ? Math.round((custo / visitas) * 100) / 100 : null,
    taxaDeResposta: saiu.length > 0 ? respondidas / saiu.length : null,
  };
}

/** A régua do portão da F5, em código para a tela dizer "passou" ou não. */
export function portaoDoPiloto(p: {
  qualidade: string | null;
  modelosPausados: number;
  taxaOficial: number | null;
  taxaEvolution: number | null;
}): { passou: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (p.qualidade && p.qualidade.toUpperCase() !== "GREEN") motivos.push(`a qualidade do número está ${p.qualidade}`);
  if (p.modelosPausados > 0) motivos.push(`${p.modelosPausados} modelo(s) pausado(s) pela Meta`);
  if (p.taxaOficial === null) motivos.push("ainda não há listas oficiais enviadas para medir");
  return { passou: motivos.length === 0, motivos };
}

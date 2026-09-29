/**
 * Relatório para a construtora parceira (26/09/2026) — agregação pura.
 *
 * O que a construtora quer saber e só este banco sabe: quantas pessoas cada
 * empreendimento dela trouxe, quantas viraram visita e quantas compraram.
 * É o número que sustenta pedir exclusividade ou comissão melhor.
 *
 * Visita conta pelo FATO (tem data de visita) OU pela etapa de visita em
 * diante — a mesma régua do funil do bot (0072): nenhuma das duas fontes
 * conta certo sozinha. Nada de dado pessoal sai daqui: só contagens.
 */

export type LeadDoRelatorio = {
  empreendimentoId: string | null;
  etapa: string;
  visitaAgendadaEm: string | null;
};
export type VendaDoRelatorio = { empreendimentoId: string | null; valor: number };
export type LinhaDoRelatorio = {
  empreendimentoId: string;
  nome: string;
  leads: number;
  visitas: number;
  vendas: number;
  vgv: number;
};

const ETAPAS_DE_VISITA_EM_DIANTE = new Set(["visita_agendada", "documentacao", "fechado"]);

export function linhasDoRelatorio(
  imoveis: Array<{ id: string; nome: string }>,
  leads: LeadDoRelatorio[],
  vendas: VendaDoRelatorio[],
): LinhaDoRelatorio[] {
  const linhas = new Map<string, LinhaDoRelatorio>(
    imoveis.map((i) => [i.id, { empreendimentoId: i.id, nome: i.nome, leads: 0, visitas: 0, vendas: 0, vgv: 0 }]),
  );
  for (const l of leads) {
    const linha = l.empreendimentoId ? linhas.get(l.empreendimentoId) : undefined;
    if (!linha) continue;
    linha.leads++;
    if (l.visitaAgendadaEm || ETAPAS_DE_VISITA_EM_DIANTE.has(l.etapa)) linha.visitas++;
  }
  for (const v of vendas) {
    const linha = v.empreendimentoId ? linhas.get(v.empreendimentoId) : undefined;
    if (!linha) continue;
    linha.vendas++;
    linha.vgv += v.valor;
  }
  return [...linhas.values()].sort((a, b) => b.vendas - a.vendas || b.visitas - a.visitas || b.leads - a.leads);
}

export function totaisDoRelatorio(linhas: LinhaDoRelatorio[]): Omit<LinhaDoRelatorio, "empreendimentoId" | "nome"> {
  return linhas.reduce(
    (t, l) => ({ leads: t.leads + l.leads, visitas: t.visitas + l.visitas, vendas: t.vendas + l.vendas, vgv: t.vgv + l.vgv }),
    { leads: 0, visitas: 0, vendas: 0, vgv: 0 },
  );
}

export const PERIODOS_DO_RELATORIO = [30, 90, 180, 365] as const;

export function periodoDoRelatorio(valor: string | undefined): number {
  const n = Number(valor);
  return (PERIODOS_DO_RELATORIO as readonly number[]).includes(n) ? n : 90;
}

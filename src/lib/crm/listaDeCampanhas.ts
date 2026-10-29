import type { ResumoImpulsionamento } from "./impulsionamentosCalculo";
import { MINIMO_PARA_PORCENTAGEM } from "./impulsionamentosCalculo";

/**
 * A aba Campanhas de Anúncios pagos como UMA lista (29/10/2026).
 *
 * Antes a aba empilhava três blocos com as mesmas campanhas ("Qual rende
 * mais?", "Qual traz cliente melhor?" e os cartões), e cada cartão vinha com
 * o formulário aberto: 8.400 px de rolagem no celular para 8 campanhas. Agora
 * a comparação é a ORDEM da lista e o filtro, e os detalhes abrem sob demanda.
 *
 * Em produção, 13 de 19 anúncios estavam sem o valor gasto: sem ele não há
 * custo por cliente nem comparação. Por isso "Sem gasto" é um filtro e o
 * cartão recolhido pede o valor.
 */

export type Situacao = "no_ar" | "encerrada";
export type FiltroDaLista = "todas" | "no_ar" | "sem_gasto" | "encerradas";
export type OrdemDaLista = "recentes" | "melhor" | "clientes" | "investimento";

/** Anúncio detectado sem cliente novo há tanto tempo é dado como encerrado. */
export const DIAS_SEM_CLIENTE_PARA_ENCERRAR = 14;

const DIA_MS = 86_400_000;

/**
 * No ar ou encerrada. A campanha cadastrada segue as datas que o corretor
 * deu; o anúncio detectado não tem data de fim, então vale o último cliente.
 */
export function situacaoDaCampanha(r: ResumoImpulsionamento, hoje: string): Situacao {
  if (r.criadaPeloCorretor) return r.fim && r.fim < hoje ? "encerrada" : "no_ar";
  const ultimo = Date.parse(r.ultimoLeadEm);
  const fimDeHoje = Date.parse(`${hoje}T23:59:59-03:00`);
  return Number.isFinite(ultimo) &&
    fimDeHoje - ultimo > DIAS_SEM_CLIENTE_PARA_ENCERRAR * DIA_MS
    ? "encerrada"
    : "no_ar";
}

export function passaNoFiltro(
  r: ResumoImpulsionamento,
  filtro: FiltroDaLista,
  hoje: string,
): boolean {
  if (filtro === "todas") return true;
  if (filtro === "sem_gasto") return r.gastoTotal === null;
  const s = situacaoDaCampanha(r, hoje);
  return filtro === "no_ar" ? s === "no_ar" : s === "encerrada";
}

export function contarPorFiltro(
  resumos: ResumoImpulsionamento[],
  hoje: string,
): Record<FiltroDaLista, number> {
  return {
    todas: resumos.length,
    no_ar: resumos.filter((r) => passaNoFiltro(r, "no_ar", hoje)).length,
    sem_gasto: resumos.filter((r) => passaNoFiltro(r, "sem_gasto", hoje)).length,
    encerradas: resumos.filter((r) => passaNoFiltro(r, "encerradas", hoje)).length,
  };
}

/**
 * A ordem da lista. "Melhor" é a ordem do comparativo (`compararCampanhas`:
 * custo do degrau mais fundo que dá para comparar), seguida de quem não tem
 * gasto, por clientes. Em toda ordem menos "investimento", o anúncio sem
 * cliente e sem gasto vai para o fim: é o que menos tem a dizer.
 */
export function ordenarCampanhas(
  resumos: ResumoImpulsionamento[],
  ordem: OrdemDaLista,
  ordemDoComparativo: string[],
): ResumoImpulsionamento[] {
  const vazia = (r: ResumoImpulsionamento) =>
    r.leads === 0 && r.gastoTotal === null ? 1 : 0;
  const posicao = new Map(ordemDoComparativo.map((id, i) => [id, i]));
  const recente = (r: ResumoImpulsionamento) => Date.parse(r.ultimoLeadEm) || 0;

  const comparar: Record<
    OrdemDaLista,
    (a: ResumoImpulsionamento, b: ResumoImpulsionamento) => number
  > = {
    recentes: (a, b) => vazia(a) - vazia(b) || recente(b) - recente(a),
    clientes: (a, b) =>
      vazia(a) - vazia(b) || b.leads - a.leads || recente(b) - recente(a),
    investimento: (a, b) =>
      (b.gastoTotal ?? -1) - (a.gastoTotal ?? -1) || b.leads - a.leads,
    melhor: (a, b) => {
      const pa = posicao.get(a.id);
      const pb = posicao.get(b.id);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return vazia(a) - vazia(b) || b.leads - a.leads;
    },
  };
  return [...resumos].sort(comparar[ordem]);
}

/** "5 de 12 · 42%", ou só "2 de 3" quando a amostra é pequena para porcentagem. */
export function visitaramDe(r: ResumoImpulsionamento): string {
  if (r.leads === 0) return "0";
  if (r.leads < MINIMO_PARA_PORCENTAGEM) return `${r.visitas} de ${r.leads}`;
  return `${r.visitas} · ${Math.round((r.visitas / r.leads) * 100)}%`;
}

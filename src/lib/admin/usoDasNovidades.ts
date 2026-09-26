/**
 * O painel de uso das funcionalidades de 26/09/2026 (0121).
 *
 * A lição de 31/08 é a régua: "feito" e "produziu dado" são perguntas
 * diferentes, e a segunda é a que importa. Cada número aqui responde se a
 * peça está sendo USADA — seleção enviada e aberta, documento recebido,
 * pós-visita respondido, A/B decidido. Zero honesto aparece como zero.
 */

export type NumeroDeUso = { rotulo: string; valor: string; detalhe?: string };

/** "3 de 8 (38%)", ou só o total quando não há base. */
export function deQuantos(parte: number, total: number): string {
  if (total <= 0) return "0";
  return `${parte} de ${total} (${Math.round((parte / total) * 100)}%)`;
}

export function numerosDeUso(u: {
  selecoesEnviadas: number;
  selecoesAbertas: number;
  cliques: number;
  documentosRecebidos: number;
  listasCompletas: number;
  posVisitasEnviados: number;
  posVisitasRespondidos: number;
  abDecididos: number;
  ultimaVencedora: string | null;
}): NumeroDeUso[] {
  return [
    {
      rotulo: "Seleções abertas pelo cliente",
      valor: deQuantos(u.selecoesAbertas, u.selecoesEnviadas),
      detalhe: u.cliques > 0 ? `${u.cliques} clique(s) em imóvel` : undefined,
    },
    {
      rotulo: "Documentos recebidos pelo link",
      valor: String(u.documentosRecebidos),
      detalhe: u.listasCompletas > 0 ? `${u.listasCompletas} lista(s) completa(s)` : undefined,
    },
    { rotulo: "Pós-visitas respondidos", valor: deQuantos(u.posVisitasRespondidos, u.posVisitasEnviados) },
    {
      rotulo: "Testes A/B decididos",
      valor: String(u.abDecididos),
      detalhe: u.ultimaVencedora ?? undefined,
    },
  ];
}

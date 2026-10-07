import type { CampanhaListada } from "../acoes";

/**
 * A linha que o histórico mostra para uma lista que acabou de nascer, antes
 * de a tela recarregar. Um lugar só: o assistente e o envio imediato montavam
 * cada um a sua, e as duas esqueciam campo novo.
 */
export function listaRecemCriada(params: {
  id: string;
  titulo: string;
  empreendimentoNome: string | null;
  totalLeads: number;
  midias?: number;
  viva?: boolean;
}): CampanhaListada {
  return {
    id: params.id,
    titulo: params.titulo,
    empreendimentoNome: params.empreendimentoNome,
    totalLeads: params.totalLeads,
    totalEnviados: 0,
    totalRespondidos: 0,
    status: "em_andamento",
    // Lista recém-criada não tem envio nenhum, então não há placar.
    testeAB: null,
    vencedora: null,
    vencedoraEm: null,
    desfecho: { visitas: 0, vendas: 0 },
    funil: { enviadas: 0, responderam: 0, conversaram: 0, medianaRespostaMin: null },
    criadoEm: new Date().toISOString(),
    vivaAte: params.viva ? new Date(Date.now() + 30 * 86_400_000).toISOString() : null,
    midias: params.midias ?? 0,
    repetivel: true,
    pausaAutomatica: null,
  };
}

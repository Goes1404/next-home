/**
 * O funil de cada campanha do Meta — o número que só o CRM tem.
 *
 * (Roadmap Meta Ads, F2.) A tela de Anúncios já mostrava custo por lead e
 * custo por lead quente, mas GLOBAIS: gasto total ÷ leads de anúncio. Isso
 * responde "o Meta está caro?" e não responde a pergunta que decide onde pôr
 * dinheiro — QUAL campanha está cara. A junção por campanha era a parte que
 * faltava desde a F0, e ela existe porque `leads.meta_campanha_id` (0070)
 * casa com `meta_ads_metricas.campanha_id`.
 *
 * ## Por ID, nunca por nome
 *
 * Nome de campanha é rótulo de exibição e muda quando alguém renomeia no
 * Gerenciador — a atribuição do passado quebraria em silêncio. O nome aqui
 * só serve para escrever na tela.
 *
 * ## O número que a Meta não dá
 *
 * Custo por VISITA e por FECHADO. A Meta sabe quantos formulários foram
 * preenchidos; o que aconteceu depois só existe neste banco. É por isso que
 * esta agregação vale a pena mesmo com pouco volume.
 *
 * ## E o número que ninguém gosta de mostrar
 *
 * `naoAtribuidos`: leads que vieram de anúncio e NÃO têm campanha. Hoje é a
 * maioria por construção — o formato que o cliente usa é Click-to-WhatsApp,
 * que entra pelo link porteiro e não pelo formulário da Meta, então nasce
 * sem `meta_campanha_id`. Somar esses leads em campanha nenhuma faria a
 * tabela mentir para baixo, e escondê-los faria o gestor achar que a
 * campanha rendeu menos do que rendeu. Aparecem à parte, com nome próprio.
 *
 * Função pura: recebe linhas, devolve números. Quem consulta é a tela.
 */

export interface GastoDeCampanha {
  campanhaId: string;
  nome: string;
  gasto: number;
}

export interface LeadDeAnuncio {
  id: string;
  metaCampanhaId: string | null;
  /** Fato, não etapa: a etapa anda, a data da visita é o que aconteceu. */
  visitaAgendadaEm: string | null;
  etapa: string;
}

export interface DossieDeLead {
  leadId: string;
  temperaturaLabel: string | null;
}

export interface FunilDaCampanha {
  campanhaId: string;
  nome: string;
  gasto: number;
  leads: number;
  visitas: number;
  fechados: number;
  quentes: number;
  /** `null` quando o denominador é zero — a tela escreve "—". */
  custoPorLead: number | null;
  custoPorVisita: number | null;
  custoPorFechado: number | null;
  custoPorQuente: number | null;
}

export interface AgregadoDeAnuncios {
  campanhas: FunilDaCampanha[];
  /** Leads de anúncio que não puderam ser ligados a nenhuma campanha. */
  naoAtribuidos: number;
}

function dividir(gasto: number, quantidade: number): number | null {
  return quantidade > 0 ? gasto / quantidade : null;
}

export function agregarPorCampanha(params: {
  gastos: readonly GastoDeCampanha[];
  leads: readonly LeadDeAnuncio[];
  dossies: readonly DossieDeLead[];
}): AgregadoDeAnuncios {
  const quentePorLead = new Set(
    params.dossies.filter((d) => d.temperaturaLabel === "quente").map((d) => d.leadId),
  );

  const porId = new Map<string, FunilDaCampanha>();

  const garantir = (campanhaId: string, nome: string): FunilDaCampanha => {
    const atual = porId.get(campanhaId);
    if (atual) {
      // Nome vem do gasto quando existe; o lead não guarda nome de campanha.
      if (nome) atual.nome = nome;
      return atual;
    }
    const novo: FunilDaCampanha = {
      campanhaId,
      nome,
      gasto: 0,
      leads: 0,
      visitas: 0,
      fechados: 0,
      quentes: 0,
      custoPorLead: null,
      custoPorVisita: null,
      custoPorFechado: null,
      custoPorQuente: null,
    };
    porId.set(campanhaId, novo);
    return novo;
  };

  /*
   * Campanha que gastou e não trouxe lead PRECISA aparecer — é o caso que
   * mais importa numa tela de custo, e some se a lista sair só dos leads.
   */
  for (const g of params.gastos) garantir(g.campanhaId, g.nome).gasto += g.gasto;

  let naoAtribuidos = 0;

  for (const lead of params.leads) {
    if (!lead.metaCampanhaId) {
      naoAtribuidos++;
      continue;
    }
    // Lead com campanha que não gastou nada NA JANELA também aparece: o
    // gasto pode ser anterior ao corte, e sumir com o lead seria pior.
    const linha = garantir(lead.metaCampanhaId, "");
    linha.leads++;
    if (lead.visitaAgendadaEm) linha.visitas++;
    if (lead.etapa === "fechado") linha.fechados++;
    if (quentePorLead.has(lead.id)) linha.quentes++;
  }

  const campanhas = [...porId.values()].map((c) => ({
    ...c,
    custoPorLead: dividir(c.gasto, c.leads),
    custoPorVisita: dividir(c.gasto, c.visitas),
    custoPorFechado: dividir(c.gasto, c.fechados),
    custoPorQuente: dividir(c.gasto, c.quentes),
  }));

  // Quem gastou mais primeiro: a tela é sobre para onde o dinheiro foi.
  campanhas.sort((a, b) => b.gasto - a.gasto || b.leads - a.leads);

  return { campanhas, naoAtribuidos };
}

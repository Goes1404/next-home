/**
 * O DESFECHO de uma lista de transmissão: além de quem respondeu, quem
 * marcou visita e quem comprou depois de receber a mensagem (Fase 3 do plano
 * das listas, 03/10/2026).
 *
 * "Responderam 4%" diz se a abertura funcionou; não diz se a lista trouxe
 * negócio. Visita e venda moram em outras tabelas (`leads.visita_marcada_em`,
 * `vendas`), e é aqui que as três pontas se encontram.
 *
 * ## A régua de atribuição, declarada
 *
 * Conta o lead que RECEBEU a mensagem (item enviado ou respondido) e cuja
 * visita foi marcada, ou cuja venda foi registrada, DEPOIS do envio e dentro
 * de `DIAS_DE_ATRIBUICAO`. É atribuição por proximidade, não prova de causa:
 * o lead pode ter vindo por outro caminho na mesma semana. A janela existe
 * para uma venda de seis meses depois não ser creditada a uma mensagem que
 * ninguém lembra mais.
 *
 * Venda distratada não conta. Cada lead conta uma vez por lista.
 *
 * Módulo puro: quem lê o banco é a action.
 */

export const DIAS_DE_ATRIBUICAO = 60;

export type ItemEnviado = { leadId: string | null; enviadoEm: string | null };
export type VisitaDoLead = { leadId: string; marcadaEm: string | null };
export type VendaDoLead = { leadId: string | null; criadaEm: string; status: string };

export type Desfecho = { visitas: number; vendas: number };

function dentroDaJanela(envio: number, evento: string | null): boolean {
  if (!evento) return false;
  const t = new Date(evento).getTime();
  return Number.isFinite(t) && t >= envio && t - envio <= DIAS_DE_ATRIBUICAO * 86_400_000;
}

export function desfechoDaLista(params: {
  itens: ItemEnviado[];
  visitas: VisitaDoLead[];
  vendas: VendaDoLead[];
}): Desfecho {
  const envioPorLead = new Map<string, number>();
  for (const item of params.itens) {
    if (!item.leadId || !item.enviadoEm) continue;
    const t = new Date(item.enviadoEm).getTime();
    if (!Number.isFinite(t)) continue;
    // O PRIMEIRO envio para o lead nesta lista é o que abre a janela.
    const atual = envioPorLead.get(item.leadId);
    if (atual === undefined || t < atual) envioPorLead.set(item.leadId, t);
  }

  const comVisita = new Set<string>();
  for (const v of params.visitas) {
    const envio = envioPorLead.get(v.leadId);
    if (envio !== undefined && dentroDaJanela(envio, v.marcadaEm)) comVisita.add(v.leadId);
  }

  const comVenda = new Set<string>();
  for (const v of params.vendas) {
    if (!v.leadId || v.status === "distratada") continue;
    const envio = envioPorLead.get(v.leadId);
    if (envio !== undefined && dentroDaJanela(envio, v.criadaEm)) comVenda.add(v.leadId);
  }

  return { visitas: comVisita.size, vendas: comVenda.size };
}

/** O que cada estado de item quer dizer, em português de gente. */
export const ROTULO_DO_ITEM: Record<string, string> = {
  pendente: "Na fila",
  enviado: "Enviada",
  respondido: "Respondeu",
  erro: "Não enviada",
};

/**
 * A linha da ficha "Entrou na lista de transmissão X em DD/MM" (Fase 1).
 * O dia sai no fuso de São Paulo: das 21h à meia-noite o servidor UTC já
 * virou o dia, a armadilha que este projeto conhece de cor.
 */
export function textoDaEntradaNaLista(titulo: string | null, em: string): string {
  const dia = new Date(em).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const nome = titulo?.trim() ? `"${titulo.trim()}"` : "sem título";
  return `Entrou na lista de transmissão ${nome} em ${dia}`;
}

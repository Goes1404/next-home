import "server-only";

import { createClient } from "@/lib/supabase/server";
import { situacaoDaTarefa, type Tarefa } from "@/lib/crm/timeline";
import type { Lead } from "@/lib/types";

/**
 * A fila de trabalho do Início — "o que fazer AGORA", em ordem.
 *
 * O painel antigo mostrava números e deixava a decisão com o corretor: 3
 * pendências, 2 visitas, um termômetro. Bonito, mas quem trabalha no celular
 * entre uma visita e outra não quer decidir — quer a próxima ação com um
 * botão do lado (roadmap F3).
 *
 * A ordem é a do custo de perder: visita de hoje some no fim do dia, lead
 * novo esfria em horas, tarefa vencida já está atrasada. Rótulo de IA e lead
 * parado vêm por último — importam, mas esperam.
 */

export type TipoItemFila =
  | "visita_hoje"
  | "lead_novo"
  | "tarefa_vencida"
  | "tarefa_hoje"
  | "sem_revisao"
  | "lead_parado";

export type ItemFila = {
  /** Único na lista — `${tipo}:${id da origem}`. */
  chave: string;
  tipo: TipoItemFila;
  /** O que fazer, em uma linha. */
  titulo: string;
  /** Por que está aqui (hora da visita, dias parado, prazo da tarefa). */
  detalhe: string;
  /** Para onde o toque leva. */
  href: string;
  /** Ação de contato direto, quando o item tem telefone. */
  whatsapp?: string;
  /** Tarefa de origem — o que permite concluí-la sem sair do Início. */
  tarefaId?: string;
  /** Peso na ordenação; menor primeiro. */
  peso: number;
};

/** Quantos itens a fila mostra. Mais que isso vira lista, não fila. */
export const TETO_DA_FILA = 6;

/** Dias sem mexer no lead até ele contar como parado. */
const DIAS_PARA_ESFRIAR = 7;

const PESO: Record<TipoItemFila, number> = {
  visita_hoje: 0,
  tarefa_vencida: 1,
  lead_novo: 2,
  tarefa_hoje: 3,
  sem_revisao: 4,
  lead_parado: 5,
};

const horaCurta = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Link de WhatsApp do lead, sem texto pronto — quem escreve é o corretor. */
function whatsappDoLead(lead: Pick<Lead, "telefone">): string | undefined {
  const digitos = (lead.telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return undefined;
  const comPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${comPais}`;
}

function diasDesde(iso: string, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Monta a fila a partir do que já está carregado (tarefas) mais três
 * consultas recortadas — nenhuma delas baixa a carteira: cada uma pede no
 * máximo `TETO_DA_FILA` linhas, porque a fila só mostra isso.
 */
export async function getFilaDeTrabalho(
  tarefas: Tarefa[],
  agora: Date = new Date(),
): Promise<ItemFila[]> {
  const supabase = await createClient();

  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);

  const limiteEsfriar = new Date(agora.getTime() - DIAS_PARA_ESFRIAR * 86_400_000).toISOString();

  const [visitas, novos, parados, revisao] = await Promise.all([
    supabase
      .from("leads")
      .select("id, nome, telefone, visita_agendada_em")
      .eq("etapa", "visita_agendada")
      .gte("visita_agendada_em", `${dia}T00:00:00-03:00`)
      .lte("visita_agendada_em", `${dia}T23:59:59-03:00`)
      .order("visita_agendada_em", { ascending: true })
      .limit(TETO_DA_FILA),
    supabase
      .from("leads")
      .select("id, nome, telefone, created_at")
      .eq("etapa", "novo")
      .order("created_at", { ascending: true })
      .limit(TETO_DA_FILA),
    supabase
      .from("leads")
      .select("id, nome, telefone, etapa_alterada_em")
      .in("etapa", ["primeiro_contato", "proposta_enviada", "negociacao"])
      .lt("etapa_alterada_em", limiteEsfriar)
      .order("etapa_alterada_em", { ascending: true })
      .limit(TETO_DA_FILA),
    // Só a contagem: a fila leva o corretor para a tela de Conversas, que é
    // onde a revisão acontece balão a balão.
    supabase
      .from("ia_interacoes")
      .select("id", { count: "exact", head: true })
      .in("origem", ["webhook", "followup"])
      .eq("e_teste", false)
      .in("acao", ["respondida", "visita_confirmada"])
      .is("avaliacao", null)
      .not("conversa_id", "is", null),
  ]);

  const itens: ItemFila[] = [];

  for (const lead of visitas.data ?? []) {
    itens.push({
      chave: `visita_hoje:${lead.id}`,
      tipo: "visita_hoje",
      titulo: `Visita com ${lead.nome}`,
      detalhe: lead.visita_agendada_em
        ? `Hoje às ${horaCurta.format(new Date(lead.visita_agendada_em))}`
        : "Hoje, sem horário definido",
      href: `/corretor/leads/${lead.id}`,
      whatsapp: whatsappDoLead(lead),
      peso: PESO.visita_hoje,
    });
  }

  for (const lead of novos.data ?? []) {
    const dias = diasDesde(lead.created_at, agora);
    itens.push({
      chave: `lead_novo:${lead.id}`,
      tipo: "lead_novo",
      titulo: `Falar com ${lead.nome}`,
      detalhe:
        dias === 0 ? "Chegou hoje, sem atendimento" : `Esperando há ${dias} ${dias === 1 ? "dia" : "dias"}`,
      href: `/corretor/leads/${lead.id}`,
      whatsapp: whatsappDoLead(lead),
      peso: PESO.lead_novo,
    });
  }

  for (const tarefa of tarefas) {
    const situacao = situacaoDaTarefa(tarefa, agora);
    if (situacao !== "atrasada" && situacao !== "hoje") continue;
    itens.push({
      chave: `tarefa:${tarefa.id}`,
      tipo: situacao === "atrasada" ? "tarefa_vencida" : "tarefa_hoje",
      titulo: tarefa.titulo,
      detalhe:
        situacao === "atrasada"
          ? `Atrasada desde ${new Date(tarefa.prazo).toLocaleDateString("pt-BR")}`
          : `Para hoje, ${horaCurta.format(new Date(tarefa.prazo))}`,
      href: tarefa.lead ? `/corretor/leads/${tarefa.lead.id}` : "/corretor/leads",
      tarefaId: tarefa.id,
      peso: situacao === "atrasada" ? PESO.tarefa_vencida : PESO.tarefa_hoje,
    });
  }

  const semRevisao = revisao.count ?? 0;
  if (semRevisao > 0) {
    itens.push({
      chave: "sem_revisao",
      tipo: "sem_revisao",
      titulo: `Revisar ${semRevisao} resposta${semRevisao === 1 ? "" : "s"} da IA`,
      detalhe: "Um 👍 ou 👎 ensina o atendimento",
      href: "/corretor/conversas",
      peso: PESO.sem_revisao,
    });
  }

  for (const lead of parados.data ?? []) {
    const dias = diasDesde(lead.etapa_alterada_em, agora);
    itens.push({
      chave: `lead_parado:${lead.id}`,
      tipo: "lead_parado",
      titulo: `Retomar ${lead.nome}`,
      detalhe: `Parado há ${dias} dias`,
      href: `/corretor/leads/${lead.id}`,
      whatsapp: whatsappDoLead(lead),
      peso: PESO.lead_parado,
    });
  }

  return ordenarFila(itens).slice(0, TETO_DA_FILA);
}

/**
 * Ordena por peso e, dentro do mesmo peso, mantém a ordem em que os itens
 * chegaram (as consultas já vêm ordenadas por urgência: visita mais cedo,
 * lead mais antigo). Exportada para o teste — a regra de prioridade é a
 * decisão de produto desta tela, e ela merece prova.
 */
export function ordenarFila(itens: ItemFila[]): ItemFila[] {
  return [...itens].sort((a, b) => a.peso - b.peso);
}

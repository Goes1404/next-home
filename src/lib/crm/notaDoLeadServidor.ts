import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { lerRamo, vocabularioDoRamo } from "@/lib/ramos/ramos";
import {
  calcularNotaDoLead,
  intencaoNasFalas,
  refinarComAIa,
  type NotaDoLead,
  type RotuloDaNota,
} from "./notaDoLead";

/**
 * A nota do lead gravada nas colunas da 0248 (IA no atendimento, 30/10/2026).
 *
 * Recebe o CLIENTE de quem chama e nunca cria um: o webhook e o tique dos
 * follow-ups passam a chave de serviço (a linha vem da instância validada ou
 * da própria varredura, e cada leitura daqui é por id de lead); a ficha passa
 * a sessão, e a RLS decide o que ela enxerga — o ADM olhando lead de outro
 * corretor não lê a conversa (0134), e a nota sai sem os sinais dela.
 *
 * Nunca lança: é sinal para a tela, não pode derrubar o atendimento. Antes
 * da 0248 aplicada a gravação falha com 42703 e a função só registra.
 */

type Cliente = SupabaseClient<Database>;

/** A janela de mensagens que a conta lê. Mais velho que isso é "sumiu". */
export const JANELA_DE_FALAS_DIAS = 45;
/** De quanto em quanto tempo a varredura do tique refaz a nota (o tempo esfria o lead). */
export const NOTA_VENCE_EM_HORAS = 6;
/**
 * Quantos leads a varredura refaz por tique (a cada 5 min). Eram 100, com
 * 100 UPDATEs em série antes da janela do tique (revisão de 30/10/2026):
 * 30 por tique são 8.640 por dia, e a nota vence em 6 h.
 */
export const NOTAS_POR_TIQUE = 30;
/** Falas do cliente que a conta lê por lead (as mais recentes). */
export const FALAS_POR_LEAD = 40;
/** Consultas de falas abertas ao mesmo tempo. */
const FALAS_EM_PARALELO = 6;

/** Roda `fazer` em cada item, no máximo `limite` ao mesmo tempo. */
async function emLotes<T>(itens: T[], limite: number, fazer: (item: T) => Promise<void>): Promise<void> {
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const item = itens[proximo++];
      await fazer(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
}

const DIA = 86_400_000;

function positivo(v: unknown): boolean {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) && n > 0;
}

function leituraDoResumo(resumo: unknown): RotuloDaNota | null {
  const t = (resumo as { temperatura?: unknown } | null)?.temperatura;
  return t === "quente" || t === "morno" || t === "frio" ? t : null;
}

/**
 * Refaz e grava a nota dos leads pedidos. Devolve a nota de cada um (o que
 * foi calculado, gravado ou não).
 */
export async function recalcularNotas(
  supabase: Cliente,
  leadIds: string[],
  agora: Date = new Date(),
  opcoes: {
    /**
     * `false` = só calcula, para mostrar (revisão de 30/10/2026). A sessão
     * do painel não grava: ela pode não ler a conversa do lead (ADM, lead
     * de outro número — 0134) e gravaria uma nota sem os sinais da conversa
     * ("frio — sumiu") por cima da boa. Quem grava é a chave de serviço:
     * webhook e tique dos follow-ups.
     */
    gravar?: boolean;
  } = {},
): Promise<Map<string, NotaDoLead>> {
  const saida = new Map<string, NotaDoLead>();
  const semFalasLidas = new Set<string>();
  const ids = [...new Set(leadIds)].filter(Boolean);
  if (ids.length === 0) return saida;
  try {
    const desde = new Date(agora.getTime() - JANELA_DE_FALAS_DIAS * DIA).toISOString();
    const [{ data: leads, error: erroLeads }, { data: dossies }, { data: conversas }] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, grupo_id, etapa, nao_contatar_em, visita_agendada_em, orcamento_min, orcamento_max, renda_mensal, tentativas_sem_resposta, resumo_conversa",
        )
        .in("id", ids),
      supabase.from("lead_observacoes_ia").select("lead_id, urgencia_mudanca, orcamento_min, orcamento_max").in("lead_id", ids),
      supabase.from("whatsapp_conversas").select("id, lead_id").in("lead_id", ids),
    ]);
    if (erroLeads || !leads) {
      if (erroLeads) console.warn(`[nota do lead] leitura falhou: ${erroLeads.message}`);
      return saida;
    }

    const leadDaConversa = new Map((conversas ?? []).map((c) => [c.id, c.lead_id as string]));
    /*
     * As falas, UMA CONSULTA POR LEAD (revisão de 30/10/2026). Era uma só,
     * com `.limit(40 * ids.length)`: com 100 leads pedia 4.000 linhas, e o
     * PostgREST corta em `max_rows` = 1.000 sem avisar. Os leads cujas falas
     * ficavam além do corte chegavam com ZERO falas e saíam "frio — sumiu".
     * Por lead, o teto de 40 é exato e nenhum lead rouba a cota do outro;
     * a concorrência é limitada para não abrir 100 conexões de uma vez.
     */
    const conversasDoLead = new Map<string, string[]>();
    for (const [conversaId, lead] of leadDaConversa) {
      conversasDoLead.set(lead, [...(conversasDoLead.get(lead) ?? []), conversaId]);
    }
    const falas = new Map<string, { em: string; texto: string }[]>();
    await emLotes([...conversasDoLead], FALAS_EM_PARALELO, async ([lead, conversaIds]) => {
      const { data: mensagens, error } = await supabase
        .from("whatsapp_mensagens")
        .select("conversa_id, conteudo, created_at")
        .in("conversa_id", conversaIds)
        .eq("remetente", "cliente")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(FALAS_POR_LEAD);
      if (error) {
        // Sem as falas a nota sairia "sumiu" — pior que não refazer agora.
        console.warn(`[nota do lead] falas não lidas: ${error.message}`);
        semFalasLidas.add(lead);
        return;
      }
      falas.set(
        lead,
        (mensagens ?? []).map((m) => ({ em: m.created_at, texto: m.conteudo ?? "" })),
      );
    });
    const comConversa = new Set(leadDaConversa.values());
    const dossieDo = new Map((dossies ?? []).map((d) => [d.lead_id, d]));

    // O compromisso do ramo de cada grupo ("visita", "reunião"...), para o motivo.
    const grupos = [...new Set(leads.map((l) => l.grupo_id))];
    const { data: ramos } = await supabase.from("grupos").select("id, ramo").in("id", grupos);
    const compromissoDo = new Map(
      (ramos ?? []).map((g) => [g.id, vocabularioDoRamo(lerRamo((g as { ramo?: unknown }).ramo)).compromisso.singular]),
    );

    const seteDias = agora.getTime() - 7 * DIA;
    for (const lead of leads) {
      if (semFalasLidas.has(lead.id)) continue;
      const dele = (falas.get(lead.id) ?? []).sort((a, b) => b.em.localeCompare(a.em));
      const dossie = dossieDo.get(lead.id);
      const base = calcularNotaDoLead(
        {
          etapa: lead.etapa,
          naoContatar: Boolean(lead.nao_contatar_em),
          ultimaFalaDoClienteEm: dele[0]?.em ?? null,
          semFalaHaMaisDeDias: dele.length === 0 && comConversa.has(lead.id) && lead.etapa !== "novo" ? JANELA_DE_FALAS_DIAS : undefined,
          falasDoClienteEm7Dias: dele.filter((f) => new Date(f.em).getTime() >= seteDias).length,
          visitaAgendadaEm: lead.visita_agendada_em,
          orcamentoInformado: positivo(lead.orcamento_min) || positivo(lead.orcamento_max) || positivo(dossie?.orcamento_min) || positivo(dossie?.orcamento_max),
          rendaInformada: positivo(lead.renda_mensal),
          intencao: intencaoNasFalas(dele.slice(0, 10).map((f) => f.texto), dossie?.urgencia_mudanca),
          tentativasSemResposta: lead.tentativas_sem_resposta ?? 0,
        },
        agora,
        { compromisso: compromissoDo.get(lead.grupo_id) ?? "visita" },
      );
      saida.set(lead.id, refinarComAIa(base, leituraDoResumo(lead.resumo_conversa)));
    }

    const calculadaEm = agora.toISOString();
    if (opcoes.gravar === false) return saida;
    for (const [id, nota] of saida) {
      const { error } = await supabase
        .from("leads")
        .update({ nota_score: nota.score, nota_label: nota.label, nota_motivo: nota.motivo.slice(0, 200), nota_calculada_em: calculadaEm })
        .eq("id", id);
      if (error) {
        // Antes da 0248 nenhuma gravação passa: não adianta insistir.
        if (error.code === "42703") {
          console.warn(`[nota do lead] não gravou (0248 pendente): ${error.message}`);
          break;
        }
        /*
         * Um lead que falha não para os outros (revisão de 30/10/2026: era
         * `break`), e ganha o carimbo mesmo assim — sem ele o lead volta no
         * topo da varredura a cada tique e trava a fila.
         */
        console.warn(`[nota do lead] não gravou: ${error.message}`);
        await supabase.from("leads").update({ nota_calculada_em: calculadaEm }).eq("id", id);
        continue;
      }
    }
  } catch (err) {
    console.error("[nota do lead]", err instanceof Error ? err.message : err);
  }
  return saida;
}

export async function recalcularNotaDoLead(
  supabase: Cliente,
  leadId: string,
  agora?: Date,
  opcoes?: { gravar?: boolean },
): Promise<NotaDoLead | null> {
  return (await recalcularNotas(supabase, [leadId], agora, opcoes)).get(leadId) ?? null;
}

/**
 * A varredura do tique dos follow-ups: refaz as notas vencidas (ou nunca
 * calculadas) dos leads em jogo. É o que faz o lead que sumiu ESFRIAR sem
 * precisar de evento nenhum. Devolve quantas refez.
 */
export async function recalcularNotasPendentes(supabase: Cliente, agora: Date = new Date()): Promise<number> {
  const vencida = new Date(agora.getTime() - NOTA_VENCE_EM_HORAS * 3_600_000).toISOString();
  const { data, error } = await supabase
    .from("leads")
    .select("id")
    .is("arquivado_em", null)
    .not("etapa", "in", "(fechado,perdido)")
    .or(`nota_calculada_em.is.null,nota_calculada_em.lt.${vencida}`)
    .order("nota_calculada_em", { ascending: true, nullsFirst: true })
    .limit(NOTAS_POR_TIQUE);
  if (error) {
    // 42703 antes da 0248: a varredura fica quieta até a migration.
    if (error.code !== "42703") console.warn(`[nota do lead] varredura: ${error.message}`);
    return 0;
  }
  if (!data || data.length === 0) return 0;
  return (await recalcularNotas(supabase, data.map((l) => l.id), agora)).size;
}

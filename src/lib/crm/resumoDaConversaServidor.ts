import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { chamarLlmJson, algumProvedorConfigurado } from "@/lib/whatsapp/llm";
import type { Ramo } from "@/lib/ramos/ramos";
import {
  cacheDaLinha,
  decidirResumo,
  falasParaOResumo,
  lerSaidaDoResumo,
  montarPromptDoResumo,
  resumoDesatualizado,
  type DecisaoDoResumo,
  type FalaDaConversa,
  type ResumoDaConversa,
} from "./resumoDaConversa";
import { notaDaLinha, type NotaDoLead } from "./notaDoLead";
import { recalcularNotaDoLead } from "./notaDoLeadServidor";

/**
 * O resumo da conversa do lead, lido e (quando a regra manda) refeito
 * (IA no atendimento, 30/10/2026).
 *
 * Tudo pela SESSÃO de quem pede: a RLS decide quais conversas entram, e o
 * cache é gravado pelas colunas que a 0248 concedeu ao `authenticated`. O
 * ADM olhando lead de outro corretor não lê a conversa (0134): o resumo sai
 * "sem conversa", sem chamada. Nunca manda mensagem para ninguém.
 */

type Cliente = SupabaseClient<Database>;

export type EstadoDoResumo = {
  resumo: ResumoDaConversa | null;
  geradoEm: string | null;
  /** Chegou mensagem que o resumo não viu. */
  desatualizado: boolean;
  nota: NotaDoLead | null;
  /** O que aconteceu neste pedido (a tela traduz). */
  decisao?: DecisaoDoResumo | "falhou";
};

/** As últimas falas do lead (todas as conversas que a sessão enxerga). */
async function falasDoLead(supabase: Cliente, leadId: string): Promise<FalaDaConversa[]> {
  const { data: conversas } = await supabase.from("whatsapp_conversas").select("id").eq("lead_id", leadId);
  const ids = (conversas ?? []).map((c) => c.id);
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, conteudo, created_at")
    .in("conversa_id", ids)
    .order("created_at", { ascending: false })
    .limit(80);
  return (data ?? []).map((m) => ({ remetente: m.remetente, texto: m.conteudo ?? "", em: m.created_at }));
}

type LinhaDoCache = {
  resumo_conversa: Json | null;
  resumo_conversa_em: string | null;
  resumo_conversa_ate: string | null;
  nota_score: number | null;
  nota_label: string | null;
  nota_motivo: string | null;
  nota_calculada_em: string | null;
};

/**
 * O cache e a nota gravados no lead. `null` antes da 0248 (42703) ou quando a
 * sessão não lê o lead: a tela simplesmente não mostra o cartão.
 */
async function linhaDoCache(supabase: Cliente, leadId: string): Promise<LinhaDoCache | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("resumo_conversa, resumo_conversa_em, resumo_conversa_ate, nota_score, nota_label, nota_motivo, nota_calculada_em")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !data) return null;
  return data as LinhaDoCache;
}

/** A nota da ficha é refeita ao abrir quando passou disto (sem IA: só a régua). */
export const NOTA_DA_FICHA_VENCE_EM_MS = 30 * 60_000;

/**
 * O estado para a primeira pintura: nenhuma chamada de IA. A nota vencida
 * (ou nunca calculada) é refeita aqui — é a régua determinística, três
 * leituras e uma gravação.
 */
export async function lerEstadoDoResumo(supabase: Cliente, leadId: string, agora: Date = new Date()): Promise<EstadoDoResumo | null> {
  const [linha, falas] = await Promise.all([linhaDoCache(supabase, leadId), falasDoLead(supabase, leadId)]);
  if (!linha) return null;
  const cache = cacheDaLinha(linha);
  const ultima = falas[0]?.em ?? null;
  const vencida =
    !linha.nota_calculada_em || agora.getTime() - new Date(linha.nota_calculada_em).getTime() > NOTA_DA_FICHA_VENCE_EM_MS;
  const nota = vencida ? ((await recalcularNotaDoLead(supabase, leadId, agora)) ?? notaDaLinha(linha)) : notaDaLinha(linha);
  return {
    resumo: cache?.resumo ?? null,
    geradoEm: cache?.geradoEm ?? null,
    desatualizado: falasParaOResumo(falas).length >= 2 && resumoDesatualizado(cache, ultima),
    nota,
  };
}

/**
 * Lê e, se a regra mandar, refaz o resumo. Quem chama já conferiu a sessão e
 * traz o uso do dia e a cota do grupo (o livro do consumo só a chave lê).
 */
export async function atualizarResumoDaConversa(
  supabase: Cliente,
  p: {
    leadId: string;
    corretorId: string;
    grupoId: string;
    ramo: Ramo;
    ramoDescricao: string | null;
    forcar: boolean;
    resumosHoje: number;
    semCota: boolean;
    agora?: Date;
  },
): Promise<EstadoDoResumo | null> {
  const agora = p.agora ?? new Date();
  const [linha, todas] = await Promise.all([linhaDoCache(supabase, p.leadId), falasDoLead(supabase, p.leadId)]);
  if (!linha) return null;
  const cache = cacheDaLinha(linha);
  const falas = falasParaOResumo(todas);
  const ultima = todas[0]?.em ?? null;

  const decisao = decidirResumo({
    cache,
    ultimaMensagemEm: ultima,
    totalDeFalas: falas.length,
    agora,
    forcar: p.forcar,
    resumosHoje: p.resumosHoje,
    semCota: p.semCota || !algumProvedorConfigurado(),
  });
  const doCache = (d: EstadoDoResumo["decisao"]): EstadoDoResumo => ({
    resumo: cache?.resumo ?? null,
    geradoEm: cache?.geradoEm ?? null,
    desatualizado: falas.length >= 2 && resumoDesatualizado(cache, ultima),
    nota: notaDaLinha(linha),
    decisao: d,
  });
  if (decisao !== "gerar") return doCache(decisao);

  const resultado = await chamarLlmJson(montarPromptDoResumo({ ramo: p.ramo, ramoDescricao: p.ramoDescricao, falas }), {
    temperature: 0.2,
    orcamentoMs: 15_000,
    uso: { finalidade: "resumo_conversa", quemPaga: { corretorId: p.corretorId, grupoId: p.grupoId } },
  });
  const resumo = resultado.ok ? lerSaidaDoResumo(resultado.json) : null;
  if (!resumo) {
    console.warn(`[resumo da conversa] sem resumo: ${resultado.ok ? "resposta incompleta" : resultado.erro}`);
    return doCache("falhou");
  }

  const geradoEm = agora.toISOString();
  const { error } = await supabase
    .from("leads")
    .update({ resumo_conversa: resumo as unknown as Json, resumo_conversa_em: geradoEm, resumo_conversa_ate: ultima ?? geradoEm })
    .eq("id", p.leadId);
  if (error) console.warn(`[resumo da conversa] cache não gravou: ${error.message}`);

  // A nota é refeita com a leitura nova da IA (o ajuste limitado da régua).
  const nota = (await recalcularNotaDoLead(supabase, p.leadId, agora)) ?? notaDaLinha(linha);
  return { resumo, geradoEm, desatualizado: false, nota, decisao: "gerar" };
}

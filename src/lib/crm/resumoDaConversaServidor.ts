import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import { chamarLlmJson, algumProvedorConfigurado } from "@/lib/whatsapp/llm";
import type { Ramo } from "@/lib/ramos/ramos";
import {
  cacheDaLinha,
  comTentativa,
  decidirResumo,
  falasParaOResumo,
  lerSaidaDoResumo,
  montarPromptDoResumo,
  resumoDesatualizado,
  type DecisaoDoResumo,
  type FalaDaConversa,
  type ResumoDaConversa,
  tentativaDoResumo,
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

/**
 * As últimas falas do lead (todas as conversas que a sessão enxerga) e
 * quantas conversas ela enxerga — zero é o ADM ou o lead cuja conversa está
 * em outro número (0134).
 */
async function falasDoLead(supabase: Cliente, leadId: string): Promise<{ falas: FalaDaConversa[]; conversasVisiveis: number }> {
  const { data: conversas } = await supabase.from("whatsapp_conversas").select("id").eq("lead_id", leadId);
  const ids = (conversas ?? []).map((c) => c.id);
  if (ids.length === 0) return { falas: [], conversasVisiveis: 0 };
  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, conteudo, created_at")
    .in("conversa_id", ids)
    .order("created_at", { ascending: false })
    .limit(80);
  return {
    falas: (data ?? []).map((m) => ({ remetente: m.remetente, texto: m.conteudo ?? "", em: m.created_at })),
    conversasVisiveis: ids.length,
  };
}

/**
 * A nota para MOSTRAR na ficha, sem gravar (revisão de 30/10/2026).
 *
 * A sessão não grava a nota: a RLS pode esconder dela a conversa do lead
 * (ADM, lead em outro número), e a conta sem as falas sai "frio — sumiu" —
 * gravada, ela trocava a nota boa da chave de serviço pela degradada. Quem
 * grava é o webhook (a cada fala do cliente) e o tique dos follow-ups.
 *
 * Sem conversa visível, vale a nota gravada (feita pela chave, com as
 * falas); só sem nenhuma a conta da sessão aparece, e só na tela.
 */
async function notaParaMostrar(
  supabase: Cliente,
  leadId: string,
  linha: LinhaDoCache,
  conversasVisiveis: number,
  agora: Date,
): Promise<NotaDoLead | null> {
  const gravada = notaDaLinha(linha);
  if (conversasVisiveis === 0 && gravada) return gravada;
  return (await recalcularNotaDoLead(supabase, leadId, agora, { gravar: false })) ?? gravada;
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
 * (ou nunca calculada) é refeita aqui só para MOSTRAR — a régua
 * determinística, sem gravação (`notaParaMostrar`).
 */
export async function lerEstadoDoResumo(supabase: Cliente, leadId: string, agora: Date = new Date()): Promise<EstadoDoResumo | null> {
  const [linha, { falas, conversasVisiveis }] = await Promise.all([
    linhaDoCache(supabase, leadId),
    falasDoLead(supabase, leadId),
  ]);
  if (!linha) return null;
  const cache = cacheDaLinha(linha);
  const ultima = falas[0]?.em ?? null;
  const vencida =
    !linha.nota_calculada_em || agora.getTime() - new Date(linha.nota_calculada_em).getTime() > NOTA_DA_FICHA_VENCE_EM_MS;
  const nota = vencida
    ? await notaParaMostrar(supabase, leadId, linha, conversasVisiveis, agora)
    : notaDaLinha(linha);
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
  const [linha, { falas: todas, conversasVisiveis }] = await Promise.all([
    linhaDoCache(supabase, p.leadId),
    falasDoLead(supabase, p.leadId),
  ]);
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
    ultimaTentativaEm: tentativaDoResumo(linha.resumo_conversa),
  });
  const doCache = (d: EstadoDoResumo["decisao"]): EstadoDoResumo => ({
    resumo: cache?.resumo ?? null,
    geradoEm: cache?.geradoEm ?? null,
    desatualizado: falas.length >= 2 && resumoDesatualizado(cache, ultima),
    nota: notaDaLinha(linha),
    decisao: d,
  });
  if (decisao !== "gerar") return doCache(decisao);

  /*
   * A TENTATIVA é carimbada antes da chamada (revisão de 30/10/2026), e só
   * segue quem conseguiu gravar: o intervalo de `decidirResumo` passa a
   * valer mesmo quando a IA devolve algo ilegível, e a sessão que a RLS não
   * deixa gravar no lead (0 linhas) não chama a IA — sem cache, ela
   * chamaria a cada abertura da ficha. De quebra, duas abas abertas juntas
   * não pagam dois resumos (a segunda vê a tentativa da primeira).
   */
  const tentativaEm = agora.toISOString();
  const carimbo = await supabase
    .from("leads")
    .update({ resumo_conversa: comTentativa(linha.resumo_conversa, tentativaEm) as unknown as Json })
    .eq("id", p.leadId)
    .select("id");
  if (carimbo.error || (carimbo.data ?? []).length === 0) {
    console.warn(
      `[resumo da conversa] tentativa não carimbada (${carimbo.error?.message ?? "0 linhas"}): sem chamada à IA`,
    );
    return doCache("falhou");
  }

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
  /*
   * Com o resumo vai `nota_calculada_em = null`: a nota muda com a leitura
   * nova da IA, mas quem a GRAVA é a chave de serviço (o tique dos
   * follow-ups pega as nunca calculadas primeiro). A sessão só mostra.
   */
  const { data: gravadas, error } = await supabase
    .from("leads")
    .update({
      resumo_conversa: { ...resumo, tentativaEm: geradoEm } as unknown as Json,
      resumo_conversa_em: geradoEm,
      resumo_conversa_ate: ultima ?? geradoEm,
      nota_calculada_em: null,
    })
    .eq("id", p.leadId)
    .select("id");
  if (error || (gravadas ?? []).length === 0) {
    console.warn(`[resumo da conversa] cache não gravou: ${error?.message ?? "0 linhas"}`);
  }

  // A nota com a leitura nova da IA (o ajuste limitado da régua), só para a tela.
  const nota = await notaParaMostrar(supabase, p.leadId, linha, conversasVisiveis, agora);
  return { resumo, geradoEm, desatualizado: false, nota, decisao: "gerar" };
}

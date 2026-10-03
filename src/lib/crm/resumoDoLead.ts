import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * O resumo do lead (plano de ativação, Fase 3, 03/10/2026): o que o corretor
 * precisa saber para retomar a conversa sem ler o histórico.
 *
 * Não é tabela nova. As peças já existiam, espalhadas: o dossiê da IA
 * (`lead_observacoes_ia`, atualizado a cada rajada, inclusive com a IA
 * calada), a ficha (`leads`) e a última mensagem da conversa. O que faltava
 * era um lugar que as juntasse — a ficha do lead nem mostrava o dossiê.
 *
 * O dossiê é do LEAD, não da conversa: na transferência para outro corretor,
 * o resumo vai junto sem cópia, e é ele que a IA do número novo lê antes de
 * responder (regra N9).
 */

export type ResumoDoLead = {
  perfil: string | null;
  imovel: string | null;
  orcamento: { min: number | null; max: number | null; renda: number | null };
  formaPagamento: string | null;
  objecoes: string[];
  visitaEm: string | null;
  etapa: string;
  ultimoContatoEm: string | null;
  proximoPasso: string | null;
  leitura: string | null;
  temperatura: { label: "quente" | "morno" | "frio"; score: number } | null;
  atualizadoEm: string | null;
};

type Cliente = SupabaseClient<Database>;

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function textos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

/**
 * Lê o resumo com o cliente de quem chama: a RLS decide o que aparece. Para
 * o ADM olhando lead de outro corretor, a conversa não é legível (0134) e o
 * "último contato" fica vazio — o resto do resumo continua.
 */
export async function lerResumoDoLead(supabase: Cliente, leadId: string): Promise<ResumoDoLead | null> {
  const [{ data: lead }, { data: dossie }, { data: conversa }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "etapa, orcamento_min, orcamento_max, renda_mensal, visita_agendada_em, conversa:empreendimentos!leads_imovel_interesse_id_fkey(nome), origem:empreendimentos!leads_empreendimento_id_fkey(nome)",
      )
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("lead_observacoes_ia")
      .select(
        "perfil_familiar, urgencia_mudanca, forma_pagamento, objecoes_identificadas, resumo_executivo, proximo_passo_sugerido, temperatura_label, temperatura_score, orcamento_min, orcamento_max, updated_at",
      )
      .eq("lead_id", leadId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("whatsapp_conversas")
      .select("ultima_interacao_em")
      .eq("lead_id", leadId)
      .order("ultima_interacao_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!lead) return null;

  // O imóvel de que a CONVERSA trata (0083) vence o de origem do formulário.
  const umSo = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { nome?: string } | null;
  const imovel = umSo(lead.conversa) ?? umSo(lead.origem);
  const perfil = [dossie?.perfil_familiar, dossie?.urgencia_mudanca].filter(Boolean).join(" · ") || null;

  return {
    perfil,
    imovel: imovel?.nome ?? null,
    // A ficha manda; o dossiê só preenche o vazio (mesma régua do webhook).
    orcamento: {
      min: numero(lead.orcamento_min) ?? numero(dossie?.orcamento_min),
      max: numero(lead.orcamento_max) ?? numero(dossie?.orcamento_max),
      renda: numero(lead.renda_mensal),
    },
    formaPagamento: dossie?.forma_pagamento ?? null,
    objecoes: textos(dossie?.objecoes_identificadas),
    visitaEm: lead.visita_agendada_em,
    etapa: lead.etapa,
    ultimoContatoEm: conversa?.ultima_interacao_em ?? null,
    proximoPasso: dossie?.proximo_passo_sugerido ?? null,
    leitura: dossie?.resumo_executivo ?? null,
    temperatura:
      dossie?.temperatura_label && typeof dossie.temperatura_score === "number"
        ? {
            label: dossie.temperatura_label as "quente" | "morno" | "frio",
            score: dossie.temperatura_score,
          }
        : null,
    atualizadoEm: dossie?.updated_at ?? null,
  };
}

const ROTULO_DA_ETAPA: Record<string, string> = {
  novo: "Novo",
  primeiro_contato: "Primeiro contato",
  visita_agendada: "Visita agendada",
  documentacao: "Documentação",
  fechado: "Fechado",
  perdido: "Perdido",
};

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * As linhas do resumo na ordem do plano (perfil → próximos passos). Linha
 * sem dado não aparece: "Forma de pagamento: —" nove vezes ensina a pular o
 * resumo inteiro.
 */
export function linhasDoResumo(r: ResumoDoLead): { rotulo: string; valor: string }[] {
  const orcamento =
    r.orcamento.min || r.orcamento.max
      ? [r.orcamento.min, r.orcamento.max]
          .filter((v): v is number => v !== null)
          .map((v) => moeda.format(v))
          .join(" a ")
      : null;
  const linhas: [string, string | null][] = [
    ["Perfil", r.perfil],
    ["Imóvel de interesse", r.imovel],
    ["Orçamento", orcamento],
    ["Renda", r.orcamento.renda ? `${moeda.format(r.orcamento.renda)}/mês` : null],
    ["Pagamento", r.formaPagamento],
    ["Objeções", r.objecoes.length > 0 ? r.objecoes.join("; ") : null],
    ["Visita", r.visitaEm ? dataHora.format(new Date(r.visitaEm)) : null],
    ["Etapa", ROTULO_DA_ETAPA[r.etapa] ?? r.etapa],
    ["Último contato", r.ultimoContatoEm ? dataHora.format(new Date(r.ultimoContatoEm)) : null],
    ["Próximo passo", r.proximoPasso],
  ];
  return linhas.filter((l): l is [string, string] => Boolean(l[1])).map(([rotulo, valor]) => ({ rotulo, valor }));
}

"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";

/**
 * Ações da ficha do lead: nota, tarefa e qualificação.
 *
 * Todas passam pelo cliente de SESSÃO — as policies da 0032 recortam por
 * dono do lead (ou gestor), então um id de lead alheio simplesmente não
 * afeta linha nenhuma. Por isso cada escrita confere o `.select()` de volta:
 * sem ele, "0 linhas afetadas" voltaria como sucesso silencioso.
 */

export type ResultadoCrm = { ok?: string; erro?: string };

async function sessao() {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." as const };
  return { corretor, supabase: await createClient() };
}

/** Anotação livre do corretor — datada e com autor, nunca sobrescrita. */
export async function adicionarNota(leadId: string, texto: string): Promise<ResultadoCrm> {
  const ctx = await sessao();
  if ("erro" in ctx) return { erro: ctx.erro };

  const conteudo = texto.trim();
  if (!conteudo) return { erro: "Escreva a anotação primeiro." };
  if (conteudo.length > 2000) return { erro: "Anotação muito longa (máx. 2000 caracteres)." };

  const { data, error } = await ctx.supabase
    .from("lead_interacoes")
    .insert({ lead_id: leadId, corretor_id: ctx.corretor.id, tipo: "nota", conteudo })
    .select("id");

  if (error || !data?.length) return { erro: "Não foi possível salvar a anotação." };

  revalidatePath(`/corretor/leads/${leadId}`);
  return { ok: "Anotação salva." };
}

export async function criarTarefa(
  leadId: string,
  titulo: string,
  prazoISO: string,
): Promise<ResultadoCrm> {
  const ctx = await sessao();
  if ("erro" in ctx) return { erro: ctx.erro };

  const texto = titulo.trim();
  if (!texto) return { erro: "Diga o que precisa ser feito." };

  const prazo = new Date(prazoISO);
  if (Number.isNaN(prazo.getTime())) return { erro: "Data inválida." };

  const { data, error } = await ctx.supabase
    .from("lead_tarefas")
    .insert({
      lead_id: leadId,
      corretor_id: ctx.corretor.id,
      titulo: texto,
      prazo: prazo.toISOString(),
    })
    .select("id");

  if (error || !data?.length) return { erro: "Não foi possível criar a tarefa." };

  revalidatePath(`/corretor/leads/${leadId}`);
  revalidatePath("/corretor");
  return { ok: "Tarefa criada." };
}

/**
 * Concluir deixa rastro na linha do tempo: daqui a um mês, "por que este
 * lead parou?" se responde lendo o histórico, não adivinhando.
 */
export async function concluirTarefa(tarefaId: string): Promise<ResultadoCrm> {
  const ctx = await sessao();
  if ("erro" in ctx) return { erro: ctx.erro };

  const { data, error } = await ctx.supabase
    .from("lead_tarefas")
    .update({ concluida_em: new Date().toISOString() })
    .eq("id", tarefaId)
    .is("concluida_em", null)
    .select("id, lead_id, titulo");

  if (error) return { erro: "Não foi possível concluir agora." };
  if (!data?.length) return { erro: "Tarefa não encontrada ou já concluída." };

  await ctx.supabase.from("lead_interacoes").insert({
    lead_id: data[0].lead_id,
    corretor_id: ctx.corretor.id,
    tipo: "sistema",
    conteudo: `Tarefa concluída: ${data[0].titulo}`,
  });

  revalidatePath(`/corretor/leads/${data[0].lead_id}`);
  revalidatePath("/corretor");
  return { ok: "Feito!" };
}

export type Qualificacao = {
  orcamentoMin: number | null;
  orcamentoMax: number | null;
  dormitoriosMin: number | null;
  regiaoInteresse: string | null;
  empreendimentoId: string | null;
};

/**
 * O que o cliente procura. Em produção, 0 de 20 leads tinham imóvel
 * vinculado e não havia onde anotar orçamento ou região — o CRM não sabia o
 * que ninguém queria comprar.
 */
export async function salvarQualificacao(
  leadId: string,
  dados: Qualificacao,
): Promise<ResultadoCrm> {
  const ctx = await sessao();
  if ("erro" in ctx) return { erro: ctx.erro };

  if (
    dados.orcamentoMin !== null &&
    dados.orcamentoMax !== null &&
    dados.orcamentoMin > dados.orcamentoMax
  ) {
    return { erro: "O orçamento mínimo está maior que o máximo." };
  }

  const { data, error } = await ctx.supabase
    .from("leads")
    .update({
      orcamento_min: dados.orcamentoMin,
      orcamento_max: dados.orcamentoMax,
      dormitorios_min: dados.dormitoriosMin,
      regiao_interesse: dados.regiaoInteresse?.trim() || null,
      empreendimento_id: dados.empreendimentoId,
    })
    .eq("id", leadId)
    .select("id");

  if (error) return { erro: "Não foi possível salvar agora." };
  if (!data?.length) return { erro: "Sem permissão para editar este lead." };

  revalidatePath(`/corretor/leads/${leadId}`);
  return { ok: "Qualificação salva." };
}

"use server";

import { revalidatePath } from "next/cache";
import { getEquipeAtiva } from "@/lib/corretorSessao";
import { CANAIS, validarRegra, type Canal, type RegraDigitada } from "@/lib/crm/regrasDeDistribuicao";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * As regras de distribuição do gestor (0246, 29/10/2026): criar, ligar e
 * desligar, mudar a ordem, apagar e simular.
 *
 * A guarda do gestor vem antes da chave; quem recebe é conferido contra a
 * equipe ativa lida pela SESSÃO; toda escrita leva o grupo do gestor no
 * filtro. A simulação vai pela SESSÃO: `simular_distribuicao` confere no
 * banco que quem pergunta é gestor e responde só com o grupo dele.
 */

type Resultado = { ok?: string; erro?: string };

const ERRO_SEM_TABELA = "As regras de distribuição ainda não foram ativadas no banco.";

function erroDoBanco(mensagem: string): string {
  return /regras_distribuicao/.test(mensagem) && /exist|schema cache/i.test(mensagem)
    ? ERRO_SEM_TABELA
    : "Não foi possível salvar a regra agora.";
}

function atualizarTelas() {
  revalidatePath("/corretor/admin/leads");
}

export async function criarRegraDeDistribuicao(digitada: RegraDigitada): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const gestor = guarda.corretor;

  const equipe = new Set((await getEquipeAtiva()).map((c) => c.id));
  const validada = validarRegra(digitada, equipe);
  if ("erro" in validada) return { erro: validada.erro };
  const r = validada.regra;

  const supabase = createServiceClient();
  // Entra no fim da fila: a ordem nova é a maior + 1.
  const { data: ultima } = await supabase
    .from("regras_distribuicao")
    .select("ordem")
    .eq("grupo_id", gestor.grupoId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("regras_distribuicao").insert({
    grupo_id: gestor.grupoId,
    ordem: (ultima?.ordem ?? 0) + 1,
    nome: r.nome,
    criterio: r.criterio,
    regioes: r.regioes,
    valor_min: r.valorMin,
    valor_max: r.valorMax,
    origens: r.origens,
    max_leads_parados: r.maxLeadsParados,
    corretores: r.corretores,
    criada_por: gestor.id,
  });
  if (error) {
    console.error("[regras] criação falhou:", error.message);
    return { erro: erroDoBanco(error.message) };
  }
  atualizarTelas();
  return { ok: "Regra criada. Vale para o próximo lead que chegar." };
}

export async function alternarRegraDeDistribuicao(id: string, ativa: boolean): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const { data, error } = await createServiceClient()
    .from("regras_distribuicao")
    .update({ ativa, atualizado_em: new Date().toISOString() })
    .eq("id", id)
    .eq("grupo_id", guarda.corretor.grupoId)
    .select("id");
  if (error || !data?.length) return { erro: error ? erroDoBanco(error.message) : "Regra não encontrada." };
  atualizarTelas();
  return { ok: ativa ? "Regra ligada." : "Regra desligada: a roleta não olha para ela." };
}

export async function excluirRegraDeDistribuicao(id: string): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const { data, error } = await createServiceClient()
    .from("regras_distribuicao")
    .delete()
    .eq("id", id)
    .eq("grupo_id", guarda.corretor.grupoId)
    .select("id");
  if (error || !data?.length) return { erro: error ? erroDoBanco(error.message) : "Regra não encontrada." };
  atualizarTelas();
  return { ok: "Regra apagada." };
}

/**
 * Sobe ou desce uma regra uma posição. Renumera a lista inteira (1, 2, 3…)
 * na ordem nova: com empates e buracos de ordens antigas, trocar só dois
 * números não garantiria a posição.
 */
export async function moverRegraDeDistribuicao(id: string, direcao: "subir" | "descer"): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const grupoId = guarda.corretor.grupoId;
  const supabase = createServiceClient();

  const { data: regras, error } = await supabase
    .from("regras_distribuicao")
    .select("id, ordem, created_at")
    .eq("grupo_id", grupoId)
    .order("ordem")
    .order("created_at");
  if (error) return { erro: erroDoBanco(error.message) };
  const lista = (regras ?? []).map((r) => r.id);
  const i = lista.indexOf(id);
  const j = direcao === "subir" ? i - 1 : i + 1;
  if (i < 0) return { erro: "Regra não encontrada." };
  if (j < 0 || j >= lista.length) return { ok: "A regra já está no limite." };
  [lista[i], lista[j]] = [lista[j], lista[i]];

  for (const [posicao, regraId] of lista.entries()) {
    const { error: erroOrdem } = await supabase
      .from("regras_distribuicao")
      .update({ ordem: posicao + 1 })
      .eq("id", regraId)
      .eq("grupo_id", grupoId);
    if (erroOrdem) return { erro: "Não foi possível mudar a ordem agora." };
  }
  atualizarTelas();
  return { ok: "Ordem salva." };
}

export type AmostraDeLead = {
  empreendimentoId: string;
  bairro: string;
  cidade: string;
  regiao: string;
  valor: string;
  canal: string;
};

export type ResultadoDaSimulacao = {
  erro?: string;
  quem?: { nome: string; regra: string | null } | null;
};

/** "Quem receberia este lead?" — sem gravar nada. */
export async function simularDistribuicao(amostra: AmostraDeLead): Promise<ResultadoDaSimulacao> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const texto = (v: string) => (v.trim() === "" ? null : v.trim().slice(0, 120));
  const valorLido = amostra.valor.trim() === "" ? null : Number(amostra.valor.replace(/\./g, "").replace(",", "."));
  if (valorLido !== null && !(Number.isFinite(valorLido) && valorLido >= 0)) return { erro: "Valor inválido." };
  const canal: Canal = (CANAIS as readonly string[]).includes(amostra.canal) ? (amostra.canal as Canal) : "outro";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("simular_distribuicao", {
    p_empreendimento: /^[0-9a-f-]{36}$/i.test(amostra.empreendimentoId) ? amostra.empreendimentoId : null,
    p_bairro: texto(amostra.bairro),
    p_cidade: texto(amostra.cidade),
    p_regiao: texto(amostra.regiao),
    p_valor: valorLido,
    p_canal: canal,
  });
  if (error) {
    console.error("[regras] simulação falhou:", error.message);
    return { erro: /simular_distribuicao/.test(error.message) ? ERRO_SEM_TABELA : "Não foi possível simular agora." };
  }
  const linha = data?.[0];
  return { quem: linha ? { nome: linha.nome, regra: linha.regra_nome } : null };
}

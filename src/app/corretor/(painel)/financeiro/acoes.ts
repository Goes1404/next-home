"use server";

import { revalidatePath } from "next/cache";
import { moverEtapa } from "@/app/corretor/actions";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import {
  hojeEmSaoPaulo,
  problemasDaVenda,
  resolverPar,
  traduzirErroDoBanco,
  type VendaDigitada,
} from "@/lib/financeiro/venda";

/**
 * As ações das vendas (0114). Tudo pelo cliente de SESSÃO: a RLS decide quem
 * grava o quê, e `salvar_venda` é SECURITY INVOKER — a função junta as duas
 * escritas numa transação sem abrir porta nenhuma.
 */

export type ResultadoVenda = { erro?: string; ok?: string; id?: string };

const ROTA = "/corretor/financeiro";

export async function salvarVenda(vendaId: string | null, v: VendaDigitada): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  // Server Action é endpoint HTTP: a tela valida para explicar, aqui valida
  // para valer.
  const problemas = problemasDaVenda(v, hojeEmSaoPaulo());
  if (problemas.length > 0) return { erro: problemas[0] };

  // Corretor comum só registra venda da qual participa. O gestor pode
  // registrar a de qualquer um (ele lança o que a equipe esqueceu).
  if (corretor.papel !== "gestor" && !v.participantes.some((p) => p.corretorId === corretor.id)) {
    return { erro: "Você precisa estar na divisão da venda que registra." };
  }

  const valorVenda = v.valorVenda as number;
  const comissao = resolverPar(valorVenda, v.comissao!);

  const dados = {
    lead_id: v.leadId ?? "",
    empreendimento_id: v.empreendimentoId ?? "",
    imovel_descricao: v.empreendimentoId ? "" : v.imovelDescricao.slice(0, 200),
    unidade: v.unidade.slice(0, 120),
    data_venda: v.dataVenda,
    valor_venda: valorVenda,
    comissao_percentual: comissao.percentual ?? "",
    comissao_valor: comissao.valor,
    status: v.status,
    distratada_em: v.status === "distratada" ? (v.distratadaEm ?? "") : "",
    observacao: v.observacao.slice(0, 2000),
  };

  const participantes = v.participantes.map((p) => {
    const repasse = resolverPar(comissao.valor, p.repasse);
    return {
      corretor_id: p.corretorId,
      parte_percentual: p.partePercentual,
      repasse_percentual: repasse.percentual ?? "",
      repasse_valor: repasse.valor,
    };
  });

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("salvar_venda", {
    p_venda: vendaId,
    p_dados: dados,
    p_participantes: participantes,
  });

  if (error || !id) {
    console.error("[vendas] falha ao salvar:", error?.message);
    return { erro: traduzirErroDoBanco(error?.message ?? "") };
  }

  // Venda nova ligada a um lead leva o cartão para "Fechado" — o funil e a
  // venda não podem contar histórias diferentes. Distrato NÃO volta o lead
  // de etapa sozinho: o que fazer com ele depois é decisão do corretor.
  let aviso = "";
  if (!vendaId && v.leadId && v.status === "ativa") {
    const { data: lead } = await supabase.from("leads").select("etapa").eq("id", v.leadId).maybeSingle();
    if (lead && lead.etapa !== "fechado") {
      const r = await moverEtapa(v.leadId, "fechado");
      if (r.erro) aviso = " O lead não foi movido para Fechado; mova pela ficha.";
    }
  }

  revalidatePath(ROTA);
  if (v.leadId) revalidatePath(`/corretor/leads/${v.leadId}`);
  return { ok: (vendaId ? "Venda atualizada." : "Venda registrada!") + aviso, id: id as string };
}

export async function excluirVenda(vendaId: string): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("vendas").delete().eq("id", vendaId).select("id, lead_id");
  if (error) return { erro: "Não foi possível excluir agora. Tente de novo." };
  // A RLS só deixa excluir quem registrou, e só antes de a comissão entrar.
  if (!data || data.length === 0) {
    return { erro: "Você não pode excluir esta venda — a comissão já entrou, ou ela não foi registrada por você." };
  }

  revalidatePath(ROTA);
  const leadId = (data[0] as { lead_id: string | null }).lead_id;
  if (leadId) revalidatePath(`/corretor/leads/${leadId}`);
  return { ok: "Venda excluída." };
}

export type LeadParaVenda = { id: string; nome: string; telefone: string | null; empreendimentoId: string | null };

/**
 * Busca de lead para ligar à venda — traz o imóvel de interesse junto, para
 * a tela já preencher o imóvel vendido (o caso comum). A RLS recorta a
 * carteira; `%_,()` saem do termo antes do `ilike`.
 */
export async function buscarLeadsParaVenda(termo: string): Promise<LeadParaVenda[]> {
  const corretor = await getCorretorLogado();
  if (!corretor) return [];
  const t = termo.trim().replace(/[%_,()]/g, "");
  if (t.length < 2) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, nome, telefone, empreendimento_id, imovel_interesse_id")
    .is("arquivado_em", null)
    .ilike("nome", `%${t}%`)
    .order("created_at", { ascending: false })
    .limit(8);

  return (data ?? []).map((l) => ({
    id: l.id,
    nome: l.nome,
    telefone: l.telefone,
    empreendimentoId: l.imovel_interesse_id ?? l.empreendimento_id ?? null,
  }));
}

// ─── F2: o gestor marca o dinheiro que entrou e o que saiu (0115) ───────

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function erroDaMarcacao(mensagem: string): string {
  if (mensagem.includes("so_gestor")) return "Só o gestor marca pagamento.";
  if (/marcar_|does not exist|PGRST202/.test(mensagem)) return "Esta ação ainda não foi ativada no banco.";
  return "Não foi possível marcar agora. Tente de novo.";
}

/** `data` null desmarca: clique errado tem volta. */
export async function marcarComissaoRecebida(vendaId: string, data: string | null): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  if (corretor.papel !== "gestor") return { erro: "Só o gestor marca pagamento." };
  if (data !== null && (!DATA_ISO.test(data) || data > hojeEmSaoPaulo())) return { erro: "Data inválida." };

  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("marcar_comissao_recebida", { p_venda: vendaId, p_data: data });
  if (error) return { erro: erroDaMarcacao(error.message) };
  if (!ok) return { erro: "Venda não encontrada." };

  revalidatePath(ROTA, "layout");
  return { ok: data ? "Comissão marcada como recebida." : "Marcação desfeita." };
}

export async function marcarRepassePago(vendaId: string, corretorId: string, data: string | null): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  if (corretor.papel !== "gestor") return { erro: "Só o gestor marca pagamento." };
  if (data !== null && (!DATA_ISO.test(data) || data > hojeEmSaoPaulo())) return { erro: "Data inválida." };

  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("marcar_repasse_pago", {
    p_venda: vendaId,
    p_corretor: corretorId,
    p_data: data,
  });
  if (error) return { erro: erroDaMarcacao(error.message) };
  if (!ok) return { erro: "Repasse não encontrado." };

  revalidatePath(ROTA, "layout");
  return { ok: data ? "Repasse marcado como pago." : "Marcação desfeita." };
}

// ─── F5: a meta do mês ──────────────────────────────────────────────────

export async function salvarMeta(params: {
  metaComissao: number | null;
  comissaoPorVenda: number | null;
}): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  if (!params.metaComissao || params.metaComissao <= 0) return { erro: "Diga quanto quer ganhar no mês." };
  if (params.metaComissao > 10_000_000) return { erro: "A meta parece alta demais. Confira os zeros." };
  if (params.comissaoPorVenda !== null && params.comissaoPorVenda <= 0) {
    return { erro: "O valor por venda precisa ser maior que zero." };
  }

  const mes = `${hojeEmSaoPaulo().slice(0, 7)}-01`;
  const supabase = await createClient();
  // Ler e decidir, não upsert: o upsert reescreveria `corretor_id` e `mes`,
  // que não têm grant de update (só a meta e a estimativa têm).
  const { data: existente } = await supabase
    .from("metas_corretor")
    .select("mes")
    .eq("corretor_id", corretor.id)
    .eq("mes", mes)
    .maybeSingle();
  const valores = {
    meta_comissao: params.metaComissao,
    comissao_por_venda: params.comissaoPorVenda,
    atualizado_em: new Date().toISOString(),
  };
  const { error } = existente
    ? await supabase.from("metas_corretor").update(valores).eq("corretor_id", corretor.id).eq("mes", mes)
    : await supabase.from("metas_corretor").insert({ corretor_id: corretor.id, mes, ...valores });
  if (error) {
    console.error("[meta] falha ao salvar:", error.message);
    return {
      erro: /metas_corretor|PGRST205/.test(error.message)
        ? "A meta ainda não foi ativada no banco."
        : "Não foi possível salvar a meta agora.",
    };
  }
  revalidatePath(ROTA, "layout");
  revalidatePath("/corretor");
  return { ok: "Meta salva." };
}

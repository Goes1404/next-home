"use server";

import { revalidatePath } from "next/cache";
import { moverEtapa } from "@/app/corretor/actions";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import {
  datasQueTravamAVenda,
  hojeEmSaoPaulo,
  problemasDaVenda,
  resolverPar,
  traduzirErroDoBanco,
  validarDistrato,
  type DistratoDigitado,
  type VendaDigitada,
} from "@/lib/financeiro/venda";
import { dividirEmParcelas, valorDaImobiliaria, type FormaRecebimento, type ParcelaNova } from "@/lib/financeiro/parcelas";
import { mesFechadoEntre, recusaDeMesFechado } from "@/lib/financeiro/mesFechado";

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
  // A forma de recebimento gravada vale para quem não a manda (o corretor):
  // a soma das parcelas é contra o que a imobiliária recebe de fato.
  const formasGravadas = new Map<string, FormaRecebimento>();
  if (vendaId) {
    const leitor = await createClient();
    const { data } = await leitor.from("venda_participantes").select("corretor_id, forma_recebimento").eq("venda_id", vendaId);
    for (const p of data ?? []) formasGravadas.set(p.corretor_id, p.forma_recebimento);
  }
  const problemas = problemasDaVenda(v, hojeEmSaoPaulo(), formasGravadas);
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
    observacao: v.observacao.slice(0, 2000),
  };

  // "Recebe direto" é do gestor (0232); do corretor, a chave nem vai, e o
  // banco mantém a marcação gravada.
  const gestor = corretor.papel === "gestor";
  const participantes: {
    corretor_id: string;
    parte_percentual: number;
    repasse_percentual: number | string;
    repasse_valor: number;
    forma_recebimento?: FormaRecebimento;
  }[] = v.participantes.map((p) => {
    const repasse = resolverPar(comissao.valor, p.repasse);
    return {
      corretor_id: p.corretorId,
      parte_percentual: p.partePercentual,
      repasse_percentual: repasse.percentual ?? "",
      repasse_valor: repasse.valor,
      ...(gestor && p.formaRecebimento ? { forma_recebimento: p.formaRecebimento } : {}),
    };
  });

  const supabase = await createClient();
  let parcelas: ParcelaNova[] = v.parcelas;
  const formaGravada = new Map<string, FormaRecebimento>();
  if (vendaId) {
    // Venda de mês fechado não muda por baixo do contador: nem o dinheiro que
    // caiu, nem a data e a comissão que contam na competência do mês.
    const [{ data: gravada }, { data: gravadas }, { data: partes }] = await Promise.all([
      supabase.from("vendas").select("data_venda").eq("id", vendaId).maybeSingle(),
      supabase.from("venda_parcelas").select("numero, valor, pagador, vence_em, recebida_em, cancelada_em").eq("venda_id", vendaId).order("numero"),
      supabase.from("venda_participantes").select("corretor_id, repasse_pago_em, forma_recebimento").eq("venda_id", vendaId),
    ]);
    const fechado = await mesFechadoEntre(
      datasQueTravamAVenda({
        dataVendaNova: v.dataVenda,
        dataVendaGravada: gravada?.data_venda ?? null,
        parcelas: (gravadas ?? []).map((p) => ({ recebidaEm: p.recebida_em, canceladaEm: p.cancelada_em })),
        repassesPagos: (partes ?? []).map((p) => p.repasse_pago_em),
      }),
    );
    if (fechado) return { erro: recusaDeMesFechado(fechado) };
    for (const p of partes ?? []) formaGravada.set(p.corretor_id, p.forma_recebimento);

    // A tela não mandou parcelas: ficam as gravadas. Se é uma só e nada
    // entrou, ela acompanha a comissão nova (o caso de corrigir o valor).
    if (parcelas.length === 0 && gravadas && gravadas.length > 0) {
      parcelas = gravadas.map((p) => ({ numero: p.numero, valor: Number(p.valor), pagador: p.pagador, venceEm: p.vence_em }));
      if (gravadas.length === 1 && !gravadas[0].recebida_em) {
        parcelas = [{ ...parcelas[0], valor: daImobiliaria(comissao.valor, participantes, formaGravada) }];
      }
    }
  }
  if (!vendaId) {
    // Venda nova com data num mês fechado mudaria a receita que o contador recebeu.
    const fechado = await mesFechadoEntre([v.dataVenda]);
    if (fechado) return { erro: recusaDeMesFechado(fechado) };
  }
  if (parcelas.length === 0) {
    const esperado = daImobiliaria(comissao.valor, participantes, formaGravada);
    parcelas = esperado > 0 ? dividirEmParcelas(esperado, 1, null, "construtora") : [];
  }

  const { data: id, error } = await supabase.rpc("salvar_venda", {
    p_venda: vendaId,
    p_dados: dados,
    p_participantes: participantes,
    p_parcelas: parcelas.map((p) => ({ numero: p.numero, valor: p.valor, pagador: p.pagador, vence_em: p.venceEm ?? "" })),
  });

  if (error || !id) {
    console.error("[vendas] falha ao salvar:", error?.message);
    return { erro: traduzirErroDoBanco(error?.message ?? "") };
  }

  // Venda nova ligada a um lead leva o cartão para "Fechado" — o funil e a
  // venda não podem contar histórias diferentes. Distrato NÃO volta o lead
  // de etapa sozinho: o que fazer com ele depois é decisão do corretor.
  let aviso = "";
  if (!vendaId && v.leadId) {
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

/** O que a imobiliária recebe, com a forma enviada ou, sem ela, a gravada. */
function daImobiliaria(
  comissao: number,
  participantes: { corretor_id: string; repasse_valor: number; forma_recebimento?: FormaRecebimento }[],
  gravada: Map<string, FormaRecebimento>,
): number {
  return valorDaImobiliaria(
    comissao,
    participantes.map((p) => ({
      formaRecebimento: p.forma_recebimento ?? gravada.get(p.corretor_id) ?? "repasse",
      repasseValor: p.repasse_valor,
    })),
  );
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

/** Uma parcela da comissão entrou (0232). `data` null desmarca: clique errado tem volta. */
export async function marcarParcelaRecebida(parcelaId: string, data: string | null): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  if (corretor.papel !== "gestor") return { erro: "Só o gestor marca pagamento." };
  if (data !== null && (!DATA_ISO.test(data) || data > hojeEmSaoPaulo())) return { erro: "Data inválida." };

  const supabase = await createClient();
  const { data: parcela } = await supabase.from("venda_parcelas").select("recebida_em").eq("id", parcelaId).maybeSingle();
  const fechado = await mesFechadoEntre([parcela?.recebida_em, data]);
  if (fechado) return { erro: recusaDeMesFechado(fechado) };
  const { data: ok, error } = await supabase.rpc("marcar_parcela_recebida", { p_parcela: parcelaId, p_data: data });
  if (error) {
    return { erro: error.message.includes("parcela_cancelada") ? traduzirErroDoBanco(error.message) : erroDaMarcacao(error.message) };
  }
  if (!ok) return { erro: "Parcela não encontrada." };

  revalidatePath(ROTA, "layout");
  return { ok: data ? "Parcela marcada como recebida." : "Marcação desfeita." };
}

/**
 * O distrato é do gestor (0232): ele decide se as parcelas em aberto
 * continuam devidas ou são canceladas. O mês da venda não muda; o que for
 * cancelado cai no mês do distrato, que precisa estar aberto.
 */
export async function distratarVenda(vendaId: string, d: DistratoDigitado): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  if (corretor.papel !== "gestor") return { erro: "Só o gestor registra o distrato. Use “Avisar distrato”." };
  const problemas = validarDistrato(d, hojeEmSaoPaulo());
  if (problemas.length > 0) return { erro: problemas[0] };

  const fechado = await mesFechadoEntre([d.data]);
  if (fechado) return { erro: recusaDeMesFechado(fechado) };
  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("distratar_venda", {
    p_venda: vendaId,
    p_data: d.data,
    p_motivo: d.motivo.trim().slice(0, 500),
    p_parcelas: d.parcelas as "manter" | "cancelar",
  });
  if (error) return { erro: traduzirErroDoBanco(error.message) };
  if (!ok) return { erro: "Venda não encontrada, ou já distratada." };

  revalidatePath(ROTA, "layout");
  return { ok: "Distrato registrado." };
}

export async function desfazerDistrato(vendaId: string): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  if (corretor.papel !== "gestor") return { erro: "Só o gestor desfaz o distrato." };

  const supabase = await createClient();
  const { data: venda } = await supabase.from("vendas").select("distratada_em").eq("id", vendaId).maybeSingle();
  const fechado = await mesFechadoEntre([venda?.distratada_em]);
  if (fechado) return { erro: recusaDeMesFechado(fechado) };
  const { data: ok, error } = await supabase.rpc("desfazer_distrato", { p_venda: vendaId });
  if (error) return { erro: traduzirErroDoBanco(error.message) };
  if (!ok) return { erro: "Venda não encontrada, ou não está distratada." };

  revalidatePath(ROTA, "layout");
  return { ok: "Distrato desfeito." };
}

/** O corretor avisa; o gestor decide (aparece nos alertas do financeiro). */
export async function avisarDistrato(vendaId: string, texto: string): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const { data: ok, error } = await supabase.rpc("avisar_distrato", { p_venda: vendaId, p_texto: texto.trim().slice(0, 500) });
  if (error) return { erro: "Não foi possível avisar agora. Tente de novo." };
  if (!ok) return { erro: "Só quem registrou ou participa da venda avisa o distrato." };

  revalidatePath(ROTA, "layout");
  return { ok: "Aviso enviado ao gestor." };
}

export async function marcarRepassePago(vendaId: string, corretorId: string, data: string | null): Promise<ResultadoVenda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  if (corretor.papel !== "gestor") return { erro: "Só o gestor marca pagamento." };
  if (data !== null && (!DATA_ISO.test(data) || data > hojeEmSaoPaulo())) return { erro: "Data inválida." };

  const supabase = await createClient();
  const { data: parte } = await supabase
    .from("venda_participantes")
    .select("repasse_pago_em")
    .eq("venda_id", vendaId)
    .eq("corretor_id", corretorId)
    .maybeSingle();
  const fechado = await mesFechadoEntre([parte?.repasse_pago_em, data]);
  if (fechado) return { erro: recusaDeMesFechado(fechado) };
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

import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { StatusUnidade } from "@/lib/imoveis/unidades";

/**
 * Escritas no catálogo pedidas pelo número central (onda 2, 30/10/2026; spec
 * do CRM pelo WhatsApp 3.7 item 28: "o 2 dorms do Vitta subiu para 480 mil",
 * "vendeu a unidade 32").
 *
 * Mora no domínio, e não em `src/lib/central/`, pelo mesmo motivo de
 * `crm/leadPeloCentral.ts`: o central resolve o pedido e só chama a escrita
 * depois do "sim" (guarda em `central/ferramentas.test.ts`). Só o gestor
 * chega aqui; quem confere o papel é o tratador (`central/tratadores/imoveis.ts`).
 *
 * Roda pela chave de serviço, sem RLS: toda leitura e escrita filtra o
 * `grupo_id` de quem foi identificado. Um id de outra imobiliária vira
 * "não achei", nunca uma escrita.
 *
 * Três regras valem para tudo:
 * - **O "sim" só vale para o que a pessoa viu.** O `executar` recebe o valor
 *   de antes que a proposta mostrou; se o banco já não está assim (alguém
 *   mudou no painel entre a proposta e o "sim"), nada é gravado.
 * - **O desfaz só volta o que ainda está como o central deixou.** Mudou de
 *   novo depois (tela de preços, editor do imóvel, outro comando)? A mudança
 *   mais nova fica, e a resposta diz.
 * - **Preço "a partir de" entra no histórico da tela de preços**
 *   (`historico_precos_lotes`/`_itens`, um lote de um imóvel). Sem isso, o
 *   reajuste feito pelo WhatsApp sumiria do histórico que o gestor confere e
 *   do "Desfazer" de lá. O desfaz daqui marca o lote como revertido, que é a
 *   trava de idempotência da tela (reverter duas vezes atropelaria um
 *   reajuste mais novo).
 */

type Supa = ReturnType<typeof createServiceClient>;

/** `numeric` chega como string no supabase-js; vazio e zero viram `null`. */
function preco(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ── Preço ──────────────────────────────────────────────────────────────────

/** O preço "a partir de" do imóvel, ou o preço de UMA planta dele. */
export type AlvoDoPreco = { tipo: "imovel"; empreendimentoId: string } | { tipo: "planta"; empreendimentoId: string; tipologiaId: string };

export type RegistroDoPreco = {
  alvo: AlvoDoPreco;
  antes: number | null;
  depois: number;
  /** O lote do histórico da tela de preços (só no "a partir de"). */
  loteId: string | null;
};

async function precoAtual(supabase: Supa, grupoId: string, alvo: AlvoDoPreco): Promise<{ achou: boolean; valor: number | null }> {
  if (alvo.tipo === "imovel") {
    const { data } = await supabase
      .from("empreendimentos")
      .select("id, preco_a_partir")
      .eq("grupo_id", grupoId)
      .eq("id", alvo.empreendimentoId)
      .maybeSingle();
    return data ? { achou: true, valor: preco(data.preco_a_partir) } : { achou: false, valor: null };
  }
  const { data } = await supabase
    .from("tipologias")
    .select("id, preco")
    .eq("grupo_id", grupoId)
    .eq("id", alvo.tipologiaId)
    .eq("empreendimento_id", alvo.empreendimentoId)
    .maybeSingle();
  return data ? { achou: true, valor: preco(data.preco) } : { achou: false, valor: null };
}

async function gravarPreco(supabase: Supa, grupoId: string, alvo: AlvoDoPreco, valor: number | null): Promise<boolean> {
  if (alvo.tipo === "imovel") {
    const { data, error } = await supabase
      .from("empreendimentos")
      .update({ preco_a_partir: valor })
      .eq("grupo_id", grupoId)
      .eq("id", alvo.empreendimentoId)
      .select("id");
    return !error && (data?.length ?? 0) > 0;
  }
  const { data, error } = await supabase
    .from("tipologias")
    .update({ preco: valor })
    .eq("grupo_id", grupoId)
    .eq("id", alvo.tipologiaId)
    .eq("empreendimento_id", alvo.empreendimentoId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

export type MudancaDePreco =
  | { desfecho: "ok"; registro: RegistroDoPreco }
  | { desfecho: "nao_achou" }
  /** O preço já não era o que a proposta mostrou: nada foi gravado. */
  | { desfecho: "mudou_antes"; atual: number | null }
  | { desfecho: "falhou" };

export async function mudarPrecoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; gestorId: string; alvo: AlvoDoPreco; antes: number | null; depois: number; nomeDoImovel: string; agora?: Date },
): Promise<MudancaDePreco> {
  const atual = await precoAtual(supabase, p.grupoId, p.alvo);
  if (!atual.achou) return { desfecho: "nao_achou" };
  if (atual.valor !== p.antes) return { desfecho: "mudou_antes", atual: atual.valor };

  if (p.alvo.tipo === "planta") {
    if (!(await gravarPreco(supabase, p.grupoId, p.alvo, p.depois))) return { desfecho: "falhou" };
    return { desfecho: "ok", registro: { alvo: p.alvo, antes: p.antes, depois: p.depois, loteId: null } };
  }

  // O lote primeiro, como na tela de preços: um preço mudado sem registro é
  // um preço que o "Desfazer" de lá nunca acha.
  const agora = p.agora ?? new Date();
  const { data: lote, error: erroLote } = await supabase
    .from("historico_precos_lotes")
    .insert({
      grupo_id: p.grupoId,
      nome_lote: `Pelo WhatsApp: ${p.nomeDoImovel} (${agora.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })})`.slice(0, 200),
      gestor_id: p.gestorId,
      total_imoveis: 1,
      status: "aplicado",
    })
    .select("id")
    .single();
  if (erroLote || !lote) return { desfecho: "falhou" };
  const loteId = String(lote.id);
  const marcarLoteVazio = () =>
    supabase
      .from("historico_precos_lotes")
      .update({ total_imoveis: 0, status: "revertido", revertido_em: agora.toISOString() })
      .eq("grupo_id", p.grupoId)
      .eq("id", loteId);

  if (!(await gravarPreco(supabase, p.grupoId, p.alvo, p.depois))) {
    await marcarLoteVazio();
    return { desfecho: "falhou" };
  }
  const variacaoReais = p.antes !== null ? p.depois - p.antes : null;
  const { error: erroItem } = await supabase.from("historico_precos_itens").insert({
    grupo_id: p.grupoId,
    lote_id: loteId,
    empreendimento_id: p.alvo.empreendimentoId,
    preco_anterior: p.antes,
    preco_novo: p.depois,
    variacao_reais: variacaoReais,
    variacao_percentual: p.antes ? Math.round(((p.depois - p.antes) / p.antes) * 10_000) / 100 : null,
  });
  if (erroItem) {
    // Sem o item, o histórico mentiria: volta o preço na hora (o mesmo
    // cuidado de `aplicarLotePrecos`).
    await gravarPreco(supabase, p.grupoId, p.alvo, p.antes);
    await marcarLoteVazio();
    return { desfecho: "falhou" };
  }
  return { desfecho: "ok", registro: { alvo: p.alvo, antes: p.antes, depois: p.depois, loteId } };
}

export type DesfazimentoDoPreco =
  | { desfecho: "ok" }
  | { desfecho: "nao_achou" }
  /** Alguém mudou o preço depois do central: a mudança mais nova fica. */
  | { desfecho: "mudou_depois"; atual: number | null }
  | { desfecho: "falhou" };

export async function desfazerPrecoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; registro: RegistroDoPreco; agora?: Date },
): Promise<DesfazimentoDoPreco> {
  const { alvo, antes, depois, loteId } = p.registro;
  const atual = await precoAtual(supabase, p.grupoId, alvo);
  if (!atual.achou) return { desfecho: "nao_achou" };
  if (atual.valor !== depois) return { desfecho: "mudou_depois", atual: atual.valor };
  if (!(await gravarPreco(supabase, p.grupoId, alvo, antes))) return { desfecho: "falhou" };
  if (loteId) {
    await supabase
      .from("historico_precos_lotes")
      .update({ status: "revertido", revertido_em: (p.agora ?? new Date()).toISOString() })
      .eq("grupo_id", p.grupoId)
      .eq("id", loteId);
  }
  return { desfecho: "ok" };
}

// ── Disponibilidade (unidade) ─────────────────────────────────────────────

export type RegistroDaUnidade = {
  unidadeId: string;
  antes: { status: StatusUnidade; reservadaAte: string | null };
  depois: StatusUnidade;
  /** O `atualizado_em` que a escrita do central deixou: é por ele que o desfaz sabe se alguém mexeu depois. */
  atualizadoEm: string | null;
};

type LinhaDaUnidade = { id: string; status: StatusUnidade; reservada_ate: string | null; atualizado_em: string | null };

async function lerUnidade(supabase: Supa, grupoId: string, unidadeId: string): Promise<LinhaDaUnidade | null> {
  const { data } = await supabase
    .from("unidades")
    .select("id, status, reservada_ate, atualizado_em")
    .eq("grupo_id", grupoId)
    .eq("id", unidadeId)
    .maybeSingle();
  return (data as LinhaDaUnidade | null) ?? null;
}

export type MudancaDaUnidade =
  | { desfecho: "ok"; registro: RegistroDaUnidade }
  | { desfecho: "nao_achou" }
  | { desfecho: "mudou_antes"; atual: StatusUnidade }
  | { desfecho: "falhou" };

/**
 * Muda o status de uma unidade (disponível ↔ vendida). Como a tabela da
 * construtora no painel (`aplicarDisponibilidade`), o status dito agora
 * apaga o prazo de reserva; o desfaz devolve o prazo que havia.
 */
export async function mudarUnidadePeloCentral(
  supabase: Supa,
  p: { grupoId: string; unidadeId: string; antes: StatusUnidade; depois: StatusUnidade; agora?: Date },
): Promise<MudancaDaUnidade> {
  const atual = await lerUnidade(supabase, p.grupoId, p.unidadeId);
  if (!atual) return { desfecho: "nao_achou" };
  if (atual.status !== p.antes) return { desfecho: "mudou_antes", atual: atual.status };
  // Copiado antes da escrita: o "antes" do desfaz não pode depender de a
  // linha lida ser um objeto novo (no banco falso dos testes é a mesma).
  const antes = { status: atual.status, reservadaAte: atual.reservada_ate };
  const { data, error } = await supabase
    .from("unidades")
    .update({ status: p.depois, reservada_ate: null, atualizado_em: (p.agora ?? new Date()).toISOString() })
    .eq("grupo_id", p.grupoId)
    .eq("id", p.unidadeId)
    .select("id, atualizado_em");
  const gravada = (data as { atualizado_em: string | null }[] | null)?.[0];
  if (error || !gravada) return { desfecho: "falhou" };
  return {
    desfecho: "ok",
    registro: {
      unidadeId: p.unidadeId,
      antes,
      depois: p.depois,
      // O que o banco devolveu, não o que foi pedido: um gatilho que carimbe
      // a hora não pode fazer o desfaz achar que "alguém mexeu".
      atualizadoEm: gravada.atualizado_em ?? null,
    },
  };
}

export type DesfazimentoDaUnidade =
  | { desfecho: "ok" }
  | { desfecho: "nao_achou" }
  | { desfecho: "mudou_depois"; atual: StatusUnidade }
  | { desfecho: "falhou" };

export async function desfazerUnidadePeloCentral(
  supabase: Supa,
  p: { grupoId: string; registro: RegistroDaUnidade; agora?: Date },
): Promise<DesfazimentoDaUnidade> {
  const { unidadeId, antes, depois, atualizadoEm } = p.registro;
  const atual = await lerUnidade(supabase, p.grupoId, unidadeId);
  if (!atual) return { desfecho: "nao_achou" };
  // Mesmo status não basta: vendida → disponível → vendida de novo no
  // painel é uma venda nova, que o desfaz daqui não pode apagar.
  if (atual.status !== depois || (atualizadoEm !== null && atual.atualizado_em !== atualizadoEm)) {
    return { desfecho: "mudou_depois", atual: atual.status };
  }
  const { data, error } = await supabase
    .from("unidades")
    .update({ status: antes.status, reservada_ate: antes.reservadaAte, atualizado_em: (p.agora ?? new Date()).toISOString() })
    .eq("grupo_id", p.grupoId)
    .eq("id", unidadeId)
    .select("id");
  return !error && (data?.length ?? 0) > 0 ? { desfecho: "ok" } : { desfecho: "falhou" };
}

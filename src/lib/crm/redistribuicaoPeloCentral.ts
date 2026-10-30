import "server-only";

import { escolherLeadsPorNome, type EscolhaDoLead } from "@/lib/agenda/comandos/escolherLead";
import { normalizar } from "@/lib/agenda/comandos/normalizar";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * A redistribuição de leads pedida pelo gestor ao número central (onda 2,
 * 30/10/2026; spec do CRM pelo WhatsApp 3.4 item 13): "passa os leads
 * parados da Ana para o Beto".
 *
 * As escritas são as de `redistribuirCarteira` (Administração → Leads), na
 * mesma ordem e pelo mesmo motivo: a linha `repasse` com a origem anterior
 * ANTES de trocar o dono (a fase 5 lê de onde cada lead veio), o update em
 * lotes, a linha do tempo de cada lead e o `admin_eventos`
 * `leads_redistribuidos`. Duas diferenças, de propósito:
 *
 * - o painel passa a carteira INTEIRA (é o gesto de quem sai da equipe);
 *   pelo central a pessoa escolhe um recorte: os parados (a régua do KPI
 *   "Parados há 15+ dias" da administração, a mesma do filtro `?parado=15`)
 *   ou todos os em andamento. Fechado, perdido e arquivado ficam com quem os
 *   trabalhou;
 * - os ids são os que a proposta mostrou (contados antes do "sim"), e só os
 *   que continuam com a dona original mudam.
 *
 * Roda pela chave de serviço: o grupo vai em toda leitura e escrita.
 */

type Supa = ReturnType<typeof createServiceClient>;

/** Marca nos `detalhes`: veio do número central. */
const ORIGEM = "central_whatsapp";

/** Ids por PATCH (vão na URL), como no painel. */
const LOTE = 200;

/** Quantos leads um pedido move: mais que isso, a pessoa repete. */
export const TETO_DA_REDISTRIBUICAO = 500;

/** "Parado" da administração: a etapa não muda há 15 dias e o negócio está em jogo. */
export const DIAS_PARADO_DO_PAINEL = 15;

export type CorretorDoGrupo = { id: string; nome: string; ativo: boolean };

/** A equipe do grupo, sem as contas ocultas (0189: não são equipe, nem na lista do gestor). */
export async function equipeDoGrupo(supabase: Supa, grupoId: string): Promise<CorretorDoGrupo[]> {
  const { data } = await supabase.from("corretores").select("id, nome, ativo, oculta").eq("grupo_id", grupoId).limit(500);
  return (data ?? []).filter((c) => !c.oculta).map((c) => ({ id: c.id, nome: c.nome?.trim() || "Sem nome", ativo: c.ativo !== false }));
}

/**
 * Quem a pessoa disse ("Ana", "o Beto", "mim"), pela régua dos leads.
 * `mim`/`eu` é o próprio gestor. Ativo primeiro: o desativado só aparece se
 * nenhum ativo casar (a carteira de quem saiu é um caso real de origem).
 */
export function escolherCorretor(
  texto: string,
  equipe: CorretorDoGrupo[],
  p: { euId: string; soAtivos: boolean },
): EscolhaDoLead<CorretorDoGrupo> {
  const dito = normalizar(texto)
    .split(" ")
    .filter((x) => x && !["o", "a", "do", "da", "de", "pro", "pra", "para", "corretor", "corretora", "leads"].includes(x))
    .join(" ");
  if (["mim", "eu", "comigo", "me"].includes(dito)) {
    const eu = equipe.find((c) => c.id === p.euId);
    return eu ? { tipo: "um", lead: eu } : { tipo: "nenhum" };
  }
  const ativos = escolherLeadsPorNome(dito, equipe.filter((c) => c.ativo));
  if (ativos.tipo !== "nenhum" || p.soAtivos) return ativos;
  return escolherLeadsPorNome(dito, equipe.filter((c) => !c.ativo));
}

export type CriterioDaRedistribuicao = { tipo: "parados"; dias: number } | { tipo: "em_andamento" };

/**
 * Os leads da origem que o critério pega, até o teto (+1, para saber se
 * sobrou). Sempre do grupo, da dona, não arquivados e em andamento.
 */
export async function leadsParaRedistribuir(
  supabase: Supa,
  p: { grupoId: string; deId: string; criterio: CriterioDaRedistribuicao; agora: Date },
): Promise<{ ids: string[]; sobrou: boolean }> {
  let consulta = supabase
    .from("leads")
    .select("id, created_at")
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.deId)
    .is("arquivado_em", null)
    .neq("etapa", "fechado")
    .neq("etapa", "perdido");
  if (p.criterio.tipo === "parados") {
    consulta = consulta.lt("etapa_alterada_em", new Date(p.agora.getTime() - p.criterio.dias * 86_400_000).toISOString());
  }
  const { data, error } = await consulta.order("created_at", { ascending: true }).limit(TETO_DA_REDISTRIBUICAO + 1);
  if (error) throw new Error(`leads para redistribuir: ${error.message}`);
  const ids = (data ?? []).map((l) => l.id);
  return { ids: ids.slice(0, TETO_DA_REDISTRIBUICAO), sobrou: ids.length > TETO_DA_REDISTRIBUICAO };
}

/** Um lead movido e a origem que ele tinha (o desfaz devolve as duas). */
export type LeadMovido = { id: string; origem: string | null };

export type Redistribuicao =
  | { desfecho: "movidos"; movidos: LeadMovido[]; deNome: string; paraNome: string }
  | { desfecho: "nenhum" }
  | { desfecho: "recusado"; motivo: string };

async function corretorNoGrupo(supabase: Supa, grupoId: string, id: string) {
  const { data } = await supabase.from("corretores").select("id, nome, ativo, oculta").eq("id", id).eq("grupo_id", grupoId).maybeSingle();
  return data;
}

async function linhaDoTempo(supabase: Supa, linhas: { lead_id: string; corretor_id: string; tipo: "repasse" | "sistema"; conteudo: string; detalhes: Record<string, string | number | boolean | null> }[]) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await supabase.from("lead_interacoes").insert(linhas.slice(i, i + LOTE));
    if (error) return error;
  }
  return null;
}

/**
 * Passa os leads `leadIds` de `deId` para `paraId`. Confere tudo no "sim":
 * os dois no grupo, o destino ativo e visível, e só os leads que ainda estão
 * com a origem (um lead que a roleta, o painel ou outra pessoa mexeu no
 * meio-tempo fica onde está).
 */
export async function redistribuirLeadsPeloCentral(
  supabase: Supa,
  p: { grupoId: string; atorId: string; deId: string; paraId: string; leadIds: string[] },
): Promise<Redistribuicao> {
  if (p.deId === p.paraId) return { desfecho: "recusado", motivo: "Origem e destino são o mesmo corretor." };
  const [de, para] = await Promise.all([corretorNoGrupo(supabase, p.grupoId, p.deId), corretorNoGrupo(supabase, p.grupoId, p.paraId)]);
  if (!de || !para || para.oculta) return { desfecho: "recusado", motivo: "Não achei um dos corretores na sua imobiliária." };
  // Mandar leads a quem está desativado só troca um limbo por outro (o painel recusa igual).
  if (!para.ativo) return { desfecho: "recusado", motivo: `${para.nome} está desativado: reative antes de passar leads para ele.` };

  const ids = [...new Set(p.leadIds)].slice(0, TETO_DA_REDISTRIBUICAO);
  const carteira: LeadMovido[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, origem_atribuicao")
      .eq("grupo_id", p.grupoId)
      .eq("corretor_id", p.deId)
      .is("arquivado_em", null)
      .in("id", ids.slice(i, i + LOTE));
    if (error) throw new Error(`carteira a redistribuir: ${error.message}`);
    carteira.push(...(data ?? []).map((l) => ({ id: l.id, origem: l.origem_atribuicao })));
  }
  if (carteira.length === 0) return { desfecho: "nenhum" };

  // A origem antes do update, como no painel: gravada depois, uma falha no
  // meio a perderia para sempre.
  const erroDoRepasse = await linhaDoTempo(
    supabase,
    carteira.map((l) => ({
      lead_id: l.id,
      corretor_id: p.atorId,
      tipo: "repasse" as const,
      conteudo: "Repasse de carteira pela gestão (número central)",
      detalhes: { origem_anterior: l.origem, de: p.deId, para: p.paraId, origem: ORIGEM },
    })),
  );
  if (erroDoRepasse) {
    console.error("[central] origem anterior não gravada:", erroDoRepasse.message);
    return { desfecho: "recusado", motivo: "Não consegui registrar a passagem dos leads agora. Tente de novo." };
  }

  const origemDe = new Map(carteira.map((l) => [l.id, l.origem]));
  const movidos: LeadMovido[] = [];
  for (let i = 0; i < carteira.length; i += LOTE) {
    const { data, error } = await supabase
      .from("leads")
      .update({ corretor_id: p.paraId, origem_atribuicao: "manual" })
      .eq("grupo_id", p.grupoId)
      .eq("corretor_id", p.deId)
      .in(
        "id",
        carteira.slice(i, i + LOTE).map((l) => l.id),
      )
      .select("id");
    if (error) throw new Error(`redistribuir: ${error.message}`);
    movidos.push(...(data ?? []).map((l) => ({ id: l.id, origem: origemDe.get(l.id) ?? null })));
  }
  if (movidos.length === 0) return { desfecho: "nenhum" };

  const erroDaLinha = await linhaDoTempo(
    supabase,
    movidos.map((l) => ({
      lead_id: l.id,
      corretor_id: p.atorId,
      tipo: "sistema" as const,
      conteudo: `Lead transferido de ${de.nome} para ${para.nome} pela gestão (número central)`,
      detalhes: { de: p.deId, para: p.paraId, motivo: "redistribuicao_de_carteira", origem: ORIGEM },
    })),
  );
  if (erroDaLinha) console.error("[central] linha do tempo da redistribuição não gravada:", erroDaLinha.message);

  // Auditoria, como no painel (a tabela não tem policy de INSERT: log forjável não é log).
  await supabase.from("admin_eventos").insert({
    ator_id: p.atorId,
    acao: "leads_redistribuidos",
    alvo_corretor_id: p.deId,
    detalhes: { para: p.paraId, quantidade: movidos.length, origem: ORIGEM },
  });

  return { desfecho: "movidos", movidos, deNome: de.nome, paraNome: para.nome };
}

export type Devolucao = { desfecho: "devolvidos"; quantos: number; ficaram: number; deNome: string; paraNome: string } | { desfecho: "recusado"; motivo: string };

/**
 * O "desfaz" da redistribuição (spec 4.6): os leads movidos voltam à dona
 * original, com a origem que tinham. Só os que ainda estão com o destino:
 * o que ele já passou adiante (ou a gestão mexeu) fica, e a resposta diz
 * quantos. A volta entra na linha do tempo e na auditoria, marcada como
 * desfeita; nenhuma linha `repasse` nova (a origem volta direto na coluna).
 */
export async function devolverLeadsPeloCentral(
  supabase: Supa,
  p: { grupoId: string; atorId: string; deId: string; paraId: string; movidos: LeadMovido[] },
): Promise<Devolucao> {
  const [de, para] = await Promise.all([corretorNoGrupo(supabase, p.grupoId, p.deId), corretorNoGrupo(supabase, p.grupoId, p.paraId)]);
  if (!de || !para) return { desfecho: "recusado", motivo: "Não achei mais um dos corretores na sua imobiliária." };
  if (!de.ativo) return { desfecho: "recusado", motivo: `${de.nome} foi desativado: os leads ficam com ${para.nome}.` };

  // Agrupados pela origem que tinham: um update por origem (e por lote).
  const porOrigem = new Map<string | null, string[]>();
  for (const l of p.movidos) porOrigem.set(l.origem, [...(porOrigem.get(l.origem) ?? []), l.id]);
  const voltaram: string[] = [];
  for (const [origem, ids] of porOrigem) {
    for (let i = 0; i < ids.length; i += LOTE) {
      const { data, error } = await supabase
        .from("leads")
        .update({ corretor_id: p.deId, origem_atribuicao: origem })
        .eq("grupo_id", p.grupoId)
        .eq("corretor_id", p.paraId)
        .in("id", ids.slice(i, i + LOTE))
        .select("id");
      if (error) throw new Error(`devolver leads: ${error.message}`);
      voltaram.push(...(data ?? []).map((l) => l.id));
    }
  }

  if (voltaram.length > 0) {
    const erro = await linhaDoTempo(
      supabase,
      voltaram.map((id) => ({
        lead_id: id,
        corretor_id: p.atorId,
        tipo: "sistema" as const,
        conteudo: `Transferência desfeita: o lead voltou de ${para.nome} para ${de.nome} (número central)`,
        detalhes: { de: p.paraId, para: p.deId, motivo: "redistribuicao_desfeita", origem: ORIGEM, desfeito: true },
      })),
    );
    if (erro) console.error("[central] linha do tempo da devolução não gravada:", erro.message);
    await supabase.from("admin_eventos").insert({
      ator_id: p.atorId,
      acao: "leads_redistribuidos",
      alvo_corretor_id: p.paraId,
      detalhes: { para: p.deId, quantidade: voltaram.length, origem: ORIGEM, desfeito: true },
    });
  }
  return { desfecho: "devolvidos", quantos: voltaram.length, ficaram: p.movidos.length - voltaram.length, deNome: de.nome, paraNome: para.nome };
}

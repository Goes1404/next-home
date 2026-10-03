import "server-only";

import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import {
  DIAS_SEM_INSISTIR,
  montarListasSugeridas,
  type DiasDeParado,
  type LeadParaSugestao,
  type ListasSugeridas,
} from "./listasSugeridas";

/** Leads lidos por vez: a carteira de um corretor é de ~100; o teto só evita o pior caso. */
const TETO_DE_LEADS = 1000;

type Embed = { slug: string; nome: string } | { slug: string; nome: string }[] | null;
const umSo = (v: Embed) => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * As listas sugeridas do corretor logado (plano de ativação, Fase 4).
 *
 * Recorta pelo corretor logado mesmo quando ele é ADM: a lista vira uma
 * lista de transmissão no número DELE, e lead de colega não sai por ali.
 */
export async function getListasSugeridas(diasParado: DiasDeParado): Promise<ListasSugeridas | null> {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const supabase = await createClient();
  const limiteInsistencia = new Date(Date.now() - DIAS_SEM_INSISTIR * 86_400_000).toISOString();

  const [{ data: leads }, { data: conversas }, { data: fila }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, nome, telefone, etapa, tentativas_contato, ultima_tentativa_em, nao_contatar_em, arquivado_em, conversa:empreendimentos!leads_imovel_interesse_id_fkey(slug, nome), origem:empreendimentos!leads_empreendimento_id_fkey(slug, nome)",
      )
      .eq("corretor_id", corretor.id)
      .is("arquivado_em", null)
      .is("nao_contatar_em", null)
      .not("etapa", "in", "(fechado,perdido)")
      .limit(TETO_DE_LEADS),
    supabase
      .from("whatsapp_conversas")
      .select("lead_id, ultima_interacao_em")
      .eq("corretor_id", corretor.id)
      .not("lead_id", "is", null),
    // Recebeu lista de transmissão nos últimos 30 dias e não respondeu.
    supabase
      .from("whatsapp_campanhas_fila")
      .select("lead_id, campanha:whatsapp_campanhas!inner(corretor_id)")
      .eq("campanha.corretor_id", corretor.id)
      .eq("status", "enviado")
      .gte("enviado_em", limiteInsistencia)
      .not("lead_id", "is", null),
  ]);

  const ultimaConversa = new Map<string, string>();
  for (const c of conversas ?? []) {
    if (!c.lead_id || !c.ultima_interacao_em) continue;
    const atual = ultimaConversa.get(c.lead_id);
    if (!atual || c.ultima_interacao_em > atual) ultimaConversa.set(c.lead_id, c.ultima_interacao_em);
  }
  const semResposta = new Set((fila ?? []).flatMap((f) => (f.lead_id ? [f.lead_id] : [])));

  const paraSugestao: LeadParaSugestao[] = (leads ?? []).map((l) => {
    const datas = [ultimaConversa.get(l.id), l.ultima_tentativa_em].filter((d): d is string => Boolean(d));
    return {
      id: l.id,
      nome: l.nome,
      telefone: l.telefone,
      etapa: l.etapa,
      tentativasContato: l.tentativas_contato ?? 0,
      ultimoContatoEm: datas.length > 0 ? datas.sort().at(-1)! : null,
      imovel: umSo(l.conversa as Embed) ?? umSo(l.origem as Embed),
      naoContatar: Boolean(l.nao_contatar_em),
      arquivado: Boolean(l.arquivado_em),
      reativadoSemResposta: semResposta.has(l.id),
    };
  });

  return montarListasSugeridas(paraSugestao, { diasParado });
}

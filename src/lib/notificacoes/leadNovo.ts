import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { notificarCorretor } from "@/lib/notificacoes/push";
import { formatarTelefoneBr } from "@/lib/inbound/phoneUtils";
import { site } from "@/lib/site";

type Supa = ReturnType<typeof createServiceClient>;

/** Só olha lead que chegou na última hora: o resto já foi visto (ou ficou velho). */
const JANELA_MIN = 60;

/** De onde o lead veio, em português de gente. */
export function origemLegivel(origem: string | null, anuncio: string | null): string | null {
  const o = origem ?? "";
  if (o === "meta/ctwa") return anuncio ? `pelo anúncio "${anuncio}"` : "por um anúncio";
  if (o.startsWith("meta/")) return "pelo formulário do anúncio";
  if (o.startsWith("site")) return "pelo site";
  if (o.startsWith("portal") || o.startsWith("email")) return "por um portal";
  if (o.startsWith("whatsapp")) return "pelo WhatsApp";
  return null;
}

/**
 * Lead que o próprio corretor cadastrou (planilha, painel, palavra-chave)
 * não é notícia para ele. Filtro em código: no PostgREST, `neq` sobre
 * coluna nula também descarta o lead SEM origem.
 */
export function cadastradoPeloCorretor(origem: string | null): boolean {
  return !!origem && (origem.startsWith("painel") || origem === "whatsapp/ativado_pelo_corretor");
}

/** O texto da notificação. Nome útil primeiro; sem nome, o telefone. */
export function textoDoLeadNovo(l: { nome: string | null; telefone: string | null; origem: string | null; anuncio_origem: string | null }): string {
  const nome = l.nome && !/^WhatsApp \d{4}$/.test(l.nome) ? l.nome : formatarTelefoneBr(l.telefone) || "Cliente novo";
  const de = origemLegivel(l.origem, l.anuncio_origem);
  return `${nome} chegou${de ? ` ${de}` : ""}. Responda agora: o primeiro contato rápido é o que mais converte.`;
}

/**
 * Notificação de lead novo no celular do corretor dono (0203).
 *
 * Vale para lead que CHEGOU (WhatsApp, site, anúncio, portal), não para o
 * que o próprio corretor cadastrou (importação, painel, palavra-chave). O
 * claim `aviso_lead_novo_em` é gravado antes do envio: dois tiques não
 * avisam duas vezes, e o atalho do webhook não repete o do tique.
 * Só notificação: o WhatsApp do próprio número não avisa ninguém.
 */
export async function avisarLeadsNovos(supabase: Supa, agora = new Date(), somenteLeadId?: string): Promise<number> {
  const desde = new Date(agora.getTime() - JANELA_MIN * 60_000).toISOString();
  let consulta = supabase
    .from("leads")
    .select("id, nome, telefone, origem, anuncio_origem, corretor_id")
    .is("aviso_lead_novo_em", null)
    .is("arquivado_em", null)
    .not("corretor_id", "is", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(200);
  if (somenteLeadId) consulta = consulta.eq("id", somenteLeadId);
  const { data: leads, error } = await consulta;
  if (error) {
    console.warn("[lead novo] falha ao ler:", error.message);
    return 0;
  }

  /*
   * Os cadastrados pelo corretor são marcados de uma vez e sem aviso: sem a
   * marca, uma importação grande ocuparia o `limit` a cada tique e o lead
   * que chegou de verdade nunca seria lido.
   */
  const proprios = (leads ?? []).filter((l) => cadastradoPeloCorretor(l.origem)).map((l) => l.id);
  if (proprios.length > 0) {
    await supabase.from("leads").update({ aviso_lead_novo_em: agora.toISOString() }).in("id", proprios).is("aviso_lead_novo_em", null);
  }

  let avisados = 0;
  for (const l of (leads ?? []).filter((x) => !cadastradoPeloCorretor(x.origem))) {
    const { data: claim } = await supabase
      .from("leads")
      .update({ aviso_lead_novo_em: agora.toISOString() })
      .eq("id", l.id)
      .is("aviso_lead_novo_em", null)
      .select("id");
    if (!claim?.length) continue;
    const n = await notificarCorretor(supabase, l.corretor_id!, {
      titulo: `Novo lead · ${site.nome}`,
      corpo: textoDoLeadNovo(l),
      url: `/corretor/leads/${l.id}`,
      tag: `lead-${l.id}`,
    });
    if (n > 0) avisados++;
  }
  return avisados;
}

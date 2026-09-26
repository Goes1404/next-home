import "server-only";
import { site } from "@/lib/site";
import type { createServiceClient } from "@/lib/supabase/service";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { textoDoAvisoDoLink, type TipoDeEventoDoLink } from "@/lib/crm/linksDoCliente";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O que o cliente faz nos links que o corretor mandou (26/09/2026, 0121).
 *
 * O evento é gravado sempre; é dele que saem a linha "abriu a seleção,
 * clicou no Vitra" na ficha e o painel de uso. O AVISO no WhatsApp do
 * corretor só sai quando é notícia de agora: a primeira abertura da
 * seleção, o primeiro documento e a lista completa. Clique em imóvel e
 * cada documento do meio ficam na ficha — aviso que chega a cada toque do
 * cliente deixa de ser lido (a régua do `evolucaoConversa`).
 *
 * Nada aqui lança: quem chama está servindo a página do cliente.
 */
export async function registrarEventoDoLink(
  supabase: Supa,
  e: { token: string; leadId: string; corretorId: string; tipo: TipoDeEventoDoLink; detalhe?: string | null },
): Promise<void> {
  const { error } = await supabase.from("links_do_cliente_eventos").insert({
    token: e.token,
    lead_id: e.leadId,
    corretor_id: e.corretorId,
    tipo: e.tipo,
    detalhe: e.detalhe?.slice(0, 200) ?? null,
  });
  if (error) console.warn("[links] evento não gravado:", e.tipo, error.message);
}

/** O aviso do evento no WhatsApp do corretor (`avisoAoCorretor.ts`). */
export async function avisarCorretorDoLink(
  supabase: Supa,
  p: { corretorId: string; leadId: string; tipo: TipoDeEventoDoLink; nomeLead: string | null; detalhe?: string | null },
): Promise<boolean> {
  const texto = textoDoAvisoDoLink({
    tipo: p.tipo,
    nome: p.nomeLead,
    detalhe: p.detalhe ?? null,
    fichaUrl: `${site.url}/corretor/leads/${p.leadId}`,
  });
  return texto ? avisarCorretor(supabase, p.corretorId, texto) : false;
}

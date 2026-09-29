import { createServiceClient } from "@/lib/supabase/service";
import { ehToken, montarIcs, type VisitaDoFeed } from "@/lib/crm/agendaIcs";
import { site } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feed .ics das visitas de um corretor (26/09/2026). O aplicativo de
 * calendário busca sem sessão, então o token (uuid aleatório em
 * `corretor_agenda`, fora de `corretores`, que é pública — ver a 0126) é a credencial — e o feed carrega nome e
 * telefone de cliente. Trocar o link no painel invalida o antigo.
 *
 * Aceita `/api/agenda/<token>` e `/api/agenda/<token>.ics`: o iPhone
 * reconhece melhor a assinatura quando a URL termina em `.ics`.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: bruto } = await ctx.params;
  const token = bruto.replace(/\.ics$/i, "");
  if (!ehToken(token)) return new Response("Não encontrado", { status: 404 });

  const supabase = createServiceClient();
  const { data: agenda } = await supabase
    .from("corretor_agenda")
    .select("corretor:corretores(id, nome, ativo)")
    .eq("token", token)
    .maybeSingle();
  const corretor = Array.isArray(agenda?.corretor) ? agenda?.corretor[0] : agenda?.corretor;
  if (!corretor || corretor.ativo === false) return new Response("Não encontrado", { status: 404 });

  const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const ate = new Date(Date.now() + 180 * 86_400_000).toISOString();
  const { data: leads } = await supabase
    .from("leads")
    .select(
      "id, nome, telefone, visita_agendada_em, visita_confirmada_em, empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome, endereco, bairro, cidade)",
    )
    .eq("corretor_id", corretor.id)
    .is("arquivado_em", null)
    .gte("visita_agendada_em", desde)
    .lte("visita_agendada_em", ate)
    .order("visita_agendada_em", { ascending: true })
    .limit(500);

  const visitas: VisitaDoFeed[] = (leads ?? []).map((l) => {
    const e = Array.isArray(l.empreendimento) ? l.empreendimento[0] : l.empreendimento;
    const endereco = e ? [e.endereco, e.bairro, e.cidade].filter(Boolean).join(", ") : null;
    return {
      leadId: l.id,
      nome: l.nome,
      telefone: l.telefone,
      inicio: l.visita_agendada_em!,
      imovel: e?.nome ?? null,
      endereco: endereco || null,
      confirmada: Boolean(l.visita_confirmada_em),
      linkFicha: `${site.url}/corretor/leads/${l.id}`,
    };
  });

  const corpo = montarIcs(visitas, {
    nomeCalendario: `Visitas ${site.nome} — ${corretor.nome}`,
    dominio: new URL(site.url).hostname,
  });
  return new Response(corpo, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="visitas.ics"',
      "Cache-Control": "no-store",
    },
  });
}

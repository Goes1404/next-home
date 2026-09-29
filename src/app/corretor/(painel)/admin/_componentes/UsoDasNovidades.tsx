import { createClient } from "@/lib/supabase/server";
import { numerosDeUso } from "@/lib/admin/usoDasNovidades";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";

const DIAS = 30;

/**
 * O que está sendo usado das ferramentas novas, nos últimos 30 dias (0121).
 * Lido com a sessão do gestor: a RLS dele alcança a equipe inteira.
 */
export async function UsoDasNovidades() {
  const supabase = await createClient();
  const desde = janelaDeDias(DIAS).corte.toISOString();
  const contar = (q: PromiseLike<{ count: number | null }>) => Promise.resolve(q).then((r) => r.count ?? 0);

  const [enviadas, abertas, cliques, documentos, completas, posVisitas, decididas] = await Promise.all([
    contar(supabase.from("links_do_cliente").select("token", { count: "exact", head: true }).eq("tipo", "selecao").gte("created_at", desde)),
    contar(
      supabase
        .from("links_do_cliente")
        .select("token", { count: "exact", head: true })
        .eq("tipo", "selecao")
        .gte("created_at", desde)
        .not("aberto_em", "is", null),
    ),
    contar(supabase.from("links_do_cliente_eventos").select("id", { count: "exact", head: true }).eq("tipo", "clicou").gte("created_at", desde)),
    contar(supabase.from("lead_documentos").select("id", { count: "exact", head: true }).gte("created_at", desde)),
    contar(
      supabase
        .from("links_do_cliente_eventos")
        .select("id", { count: "exact", head: true })
        .eq("tipo", "documentos_completos")
        .gte("created_at", desde),
    ),
    supabase
      .from("whatsapp_followups")
      .select("conversa_id, enviado_em")
      .eq("tipo", "pos_visita")
      .eq("status", "enviado")
      .gte("enviado_em", desde)
      .limit(200),
    supabase
      .from("whatsapp_campanhas")
      .select("titulo, variante_vencedora", { count: "exact" })
      .not("variante_vencedora", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  // Respondido = alguma fala do cliente depois do pós-visita.
  let respondidos = 0;
  for (const f of posVisitas.data ?? []) {
    if (!f.enviado_em) continue;
    const { count } = await supabase
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", f.conversa_id)
      .eq("remetente", "cliente")
      .gt("created_at", f.enviado_em);
    if ((count ?? 0) > 0) respondidos++;
  }

  const ultima = decididas.data?.[0];
  const numeros = numerosDeUso({
    selecoesEnviadas: enviadas,
    selecoesAbertas: abertas,
    cliques,
    documentosRecebidos: documentos,
    listasCompletas: completas,
    posVisitasEnviados: posVisitas.data?.length ?? 0,
    posVisitasRespondidos: respondidos,
    abDecididos: decididas.count ?? 0,
    ultimaVencedora: ultima ? `última: versão ${ultima.variante_vencedora} em “${ultima.titulo}”` : null,
  });

  return (
    <section className="cartao mt-6 p-5" aria-labelledby="titulo-uso">
      <h2 id="titulo-uso" className="text-fluid-base font-bold text-titulo">
        Uso das ferramentas novas
      </h2>
      <p className="text-fluid-xs text-apoio">Últimos {DIAS} dias, equipe inteira.</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        {numeros.map((n) => (
          <div key={n.rotulo} className="rounded-xl border border-linha p-3">
            <dt className="text-fluid-xs text-apoio">{n.rotulo}</dt>
            <dd className="text-fluid-lg font-bold text-titulo tabular-nums">{n.valor}</dd>
            {n.detalhe && <dd className="text-fluid-xs text-apoio break-words">{n.detalhe}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

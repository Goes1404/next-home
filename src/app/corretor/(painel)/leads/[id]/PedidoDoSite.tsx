import Link from "next/link";
import { BellRing, Handshake, Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { lerAlerta } from "@/lib/crm/alertaDeNovidade";

/**
 * O que o lead deixou pelo site além do contato (26/09/2026): o pedido de
 * aviso de novidade, os imóveis que marcou como favoritos e o parceiro que o
 * trouxe. Some inteiro quando não há nada.
 */
export async function PedidoDoSite({ leadId }: { leadId: string }) {
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("detalhes, parceiro_id").eq("id", leadId).maybeSingle();
  if (!lead) return null;

  const detalhes = (lead.detalhes ?? {}) as { favoritos?: unknown };
  const alerta = lerAlerta(lead.detalhes);
  const favoritos = Array.isArray(detalhes.favoritos)
    ? detalhes.favoritos.filter((s): s is string => typeof s === "string")
    : [];

  const [{ data: imoveis }, parceiro] = await Promise.all([
    favoritos.length
      ? supabase.from("empreendimentos").select("slug, nome").in("slug", favoritos)
      : Promise.resolve({ data: [] as { slug: string; nome: string }[] }),
    // `parceiros` só o gestor lê pela RLS; o nome é mostrado a quem já vê o
    // lead (a RLS de `leads` decidiu isso acima).
    lead.parceiro_id
      ? createServiceClient().from("parceiros").select("nome, imobiliaria").eq("id", lead.parceiro_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!alerta.ativo && favoritos.length === 0 && !parceiro.data) return null;

  return (
    <section className="cartao space-y-2.5 p-4">
      <h2 className="text-fluid-sm text-titulo font-medium">Pelo site</h2>
      {parceiro.data && (
        <p className="text-fluid-xs flex items-center gap-2 text-corpo">
          <Handshake className="h-4 w-4 text-acento" aria-hidden />
          Trazido pelo parceiro <strong>{parceiro.data.nome}</strong>
          {parceiro.data.imobiliaria ? ` (${parceiro.data.imobiliaria})` : ""}
        </p>
      )}
      {alerta.ativo && (
        <p className="text-fluid-xs flex items-center gap-2 text-corpo">
          <BellRing className="h-4 w-4 text-acento" aria-hidden />
          Pediu aviso quando surgir imóvel que combine
          {alerta.avisados.length > 0 && ` · já avisado de ${alerta.avisados.length}`}
        </p>
      )}
      {(imoveis ?? []).length > 0 && (
        <div className="text-fluid-xs text-corpo">
          <p className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-acento" aria-hidden /> Favoritos no site:
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {(imoveis ?? []).map((i) => (
              <li key={i.slug}>
                <Link
                  href={`/corretor/imoveis/${i.slug}`}
                  className="inline-flex min-h-9 items-center rounded-full border border-linha px-3 hover:bg-vidro"
                >
                  {i.nome}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

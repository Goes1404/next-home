import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";

/**
 * Compradores deste imóvel (26/09/2026): o caminho até as chaves. Avanço
 * da obra, vistoria e entrega avisados pela lista de transmissão, com a
 * mesma cota anti-ban. Só aparece quando há comprador — botão para lista
 * vazia é ruído.
 */
export async function AvisarCompradores({ empreendimentoId, slug }: { empreendimentoId: string; slug: string }) {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("corretor_id", corretor.id)
    .eq("empreendimento_id", empreendimentoId)
    .eq("etapa", "fechado")
    .is("arquivado_em", null)
    .is("nao_contatar_em", null);
  if (!count) return null;

  return (
    <section className="cartao flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
      <div className="min-w-0">
        <h2 className="text-fluid-base font-bold text-titulo">
          {count === 1 ? "1 cliente seu comprou aqui" : `${count} clientes seus compraram aqui`}
        </h2>
        <p className="text-fluid-xs text-apoio">
          Avise o avanço da obra, a vistoria e a entrega das chaves. Cliente bem acompanhado é o que indica.
        </p>
      </div>
      <Link
        href={`/corretor/campanhas?imovel=${encodeURIComponent(slug)}&publico=compradores`}
        className="min-h-11 inline-flex items-center rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo hover:border-acento-linha"
      >
        Avisar os compradores
      </Link>
    </section>
  );
}

import { createClient } from "@/lib/supabase/server";
import { FormularioDaObra } from "./FormularioDaObra";

const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short", year: "numeric" });

/**
 * Andamento da obra (0125): o que aparece no portal de quem comprou aqui.
 * Uma atualização por mês já responde o "como está a obra?" que chegaria
 * no WhatsApp do corretor.
 */
export async function AndamentoDaObra({
  empreendimentoId,
  fotos,
}: {
  empreendimentoId: string;
  fotos: { url: string; alt: string }[];
}) {
  const supabase = await createClient();
  const { data: itens } = await supabase
    .from("obra_atualizacoes")
    .select("id, titulo, texto, percentual, created_at")
    .eq("empreendimento_id", empreendimentoId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <section className="cartao space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="text-fluid-base font-bold text-titulo">Andamento da obra</h2>
        <p className="text-fluid-xs text-apoio">
          Cada atualização aparece no portal do comprador de quem fechou neste imóvel.
        </p>
      </div>
      <FormularioDaObra empreendimentoId={empreendimentoId} fotos={fotos} />
      {(itens ?? []).length > 0 && (
        <ul className="space-y-2">
          {(itens ?? []).map((i) => (
            <li key={i.id} className="border-l-2 border-linha pl-3">
              <p className="text-fluid-xs text-tenue">
                {data.format(new Date(i.created_at))}
                {i.percentual != null && ` · ${i.percentual}%`}
              </p>
              <p className="text-fluid-sm break-words text-corpo">{i.titulo}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { exigirGestorNaAcao } from "@/lib/guardas";
import { BUCKET_CONTABILIDADE, montarPacoteDoMes } from "@/lib/financeiro/contadorDados";
import { lerMes } from "@/lib/financeiro/resultado";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O pacote do mês (0168), só para o gestor. Mês FECHADO devolve o arquivo
 * guardado no fechamento, o mesmo que o contador baixa; mês aberto monta na
 * hora, com os números de agora.
 */
export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(req: Request) {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });

  const mes = lerMes(new URL(req.url).searchParams.get("mes") ?? undefined, hojeEmSaoPaulo());
  const cabecalhos = (nome: string) => ({
    "content-type": XLSX,
    "content-disposition": `attachment; filename="${nome}.xlsx"`,
    "cache-control": "no-store",
  });

  const supabase = await createClient();
  const { data: fechado } = await supabase.from("meses_fechados").select("arquivo_path").eq("mes", `${mes}-01`).maybeSingle();
  if (fechado) {
    const { data, error } = await createServiceClient().storage.from(BUCKET_CONTABILIDADE).download(fechado.arquivo_path);
    if (error || !data) return new Response("Não consegui abrir o arquivo do mês fechado.", { status: 500 });
    return new Response(await data.arrayBuffer(), { headers: cabecalhos(`contabilidade-${mes}-fechado`) });
  }

  const pacote = await montarPacoteDoMes(mes);
  if (!pacote.ok) return new Response(pacote.motivo, { status: 500 });
  return new Response(new Uint8Array(pacote.arquivo), { headers: cabecalhos(`contabilidade-${mes}-previa`) });
}

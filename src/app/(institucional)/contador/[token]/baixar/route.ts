import { lerAcessoContador } from "@/lib/financeiro/acessoContador";
import { BUCKET_CONTABILIDADE } from "@/lib/financeiro/contadorDados";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Download de um mês fechado pelo link do contador (0168). Confere o token a
 * cada pedido (link revogado deixa de baixar na hora) e redireciona para uma
 * URL assinada de 60 segundos do bucket privado.
 */
export const dynamic = "force-dynamic";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const acesso = await lerAcessoContador(token);
  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (!acesso || !MES.test(mes)) return new Response("Não encontrado.", { status: 404, headers: { "cache-control": "no-store" } });

  const servico = createServiceClient();
  const { data: fechado } = await servico.from("meses_fechados").select("arquivo_path").eq("mes", `${mes}-01`).maybeSingle();
  if (!fechado) return new Response("Este mês não está fechado.", { status: 404, headers: { "cache-control": "no-store" } });

  const { data, error } = await servico.storage
    .from(BUCKET_CONTABILIDADE)
    .createSignedUrl(fechado.arquivo_path, 60, { download: `contabilidade-${mes}.xlsx` });
  if (error || !data) return new Response("Não consegui gerar o arquivo agora. Tente de novo.", { status: 500 });
  return Response.redirect(data.signedUrl, 302);
}

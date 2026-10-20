import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { BUCKET_DAS_EXPORTACOES } from "@/lib/grupos/encerramentoRegras";
import { arquivoDoGrupo, FalhaNaExportacao, lerDadosDoGrupo, nomeDoArquivo, TIPO_XLSX } from "@/lib/grupos/exportacaoDoGrupo";
import { contagemDaExportacao } from "@/lib/grupos/planilhasDoGrupo";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * A planilha com os dados de um grupo, baixada pela plataforma (operação
 * enxuta, 20/10/2026). É a EXCEÇÃO declarada ao §4 do desenho (o
 * administrador da plataforma não lê ficha): só existe para grupo com
 * cancelamento registrado, porque é o caso em que a plataforma entrega ao
 * cliente os leads e o catálogo dele (resposta 7 do dono). O gestor do grupo
 * baixa a dele a qualquer hora, no painel (`/api/painel/dados-do-grupo`).
 *
 * Nada de conversa (a planilha é a de `planilhasDoGrupo.ts`). Cada download
 * fica em `admin_eventos` no próprio grupo, com o operador e as contagens: o
 * gestor do grupo vê no histórico dele que a plataforma baixou.
 *
 * Depois que a rotina dos 90 dias apagou os dados, o que sobra é a cópia
 * gravada antes no bucket privado: a rota devolve um link de 1 minuto para
 * ela.
 */
export const dynamic = "force-dynamic";

const texto = (msg: string, status: number) =>
  new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  const { id } = await params;
  if (!ehUuid(id)) return texto("Grupo não encontrado.", 404);

  const servico = createServiceClient();
  const { data: grupo, error } = await servico
    .from("grupos")
    .select("id, slug, cancelado_em, dados_apagados_em, exportacao_final_caminho")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`[exportar grupo] grupo ${id} não lido: ${error.message}`);
    return texto("Não consegui ler o grupo agora. Tente de novo.", 500);
  }
  if (!grupo) return texto("Grupo não encontrado.", 404);
  if (!grupo.cancelado_em) {
    return texto(
      "A plataforma só baixa os dados de grupo com cancelamento registrado. O gestor do grupo baixa os dele no painel, em Administração.",
      403,
    );
  }

  if (grupo.dados_apagados_em) {
    if (!grupo.exportacao_final_caminho) return texto("Os dados deste grupo já foram apagados e não há cópia guardada.", 410);
    const { data: link, error: erroLink } = await servico.storage
      .from(BUCKET_DAS_EXPORTACOES)
      .createSignedUrl(grupo.exportacao_final_caminho, 60, { download: nomeDoArquivo(grupo.slug) });
    if (erroLink || !link) {
      console.error(`[exportar grupo] cópia final de ${id} sem link: ${erroLink?.message}`);
      return texto("Não consegui abrir a cópia guardada agora. Tente de novo.", 500);
    }
    return Response.redirect(link.signedUrl, 302);
  }

  let dados;
  try {
    dados = await lerDadosDoGrupo(servico, id);
  } catch (e) {
    if (!(e instanceof FalhaNaExportacao)) throw e;
    console.error(`[exportar grupo] falha ao ler ${id}:`, e.message);
    return texto("Não consegui ler os dados agora. Tente de novo.", 500);
  }

  const { error: erroLog } = await servico.from("admin_eventos").insert({
    grupo_id: id,
    acao: "dados_do_grupo_exportados",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", quem: "plataforma", ...contagemDaExportacao(dados) },
  });
  if (erroLog) {
    console.error(`[exportar grupo] registro de ${id} não gravado: ${erroLog.message}`);
    return texto("Não consegui registrar a exportação. Tente de novo.", 500);
  }

  return new Response(new Uint8Array(arquivoDoGrupo(dados)), {
    headers: {
      "content-type": TIPO_XLSX,
      "content-disposition": `attachment; filename="${nomeDoArquivo(grupo.slug)}"`,
      "cache-control": "no-store",
    },
  });
}

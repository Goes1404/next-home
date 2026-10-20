import { exigirGestorNaAcao } from "@/lib/guardas";
import { arquivoDoGrupo, FalhaNaExportacao, lerDadosDoGrupo, nomeDoArquivo, TIPO_XLSX } from "@/lib/grupos/exportacaoDoGrupo";
import { contagemDaExportacao } from "@/lib/grupos/planilhasDoGrupo";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Baixar todos os dados da imobiliária" (operação enxuta, 20/10/2026): o
 * gestor baixa, a qualquer hora, a planilha com os leads (a ficha), os
 * imóveis, os corretores e as vendas do grupo dele. Nunca conversa.
 *
 * A leitura é pela sessão do gestor (a RLS recorta o grupo) e filtra o grupo
 * de novo, por escrito (`exportacaoDoGrupo.ts`). A chave de serviço só grava
 * o registro em `admin_eventos` (`dados_do_grupo_exportados`, com as
 * contagens): é dado pessoal de clientes saindo do sistema. Sem o registro, a
 * planilha não sai — a mesma regra das fichas do corretor que sai.
 */
export const dynamic = "force-dynamic";

const texto = (msg: string, status: number) =>
  new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET() {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
  const grupoId = guarda.corretor.grupoId;

  const supabase = await createClient();
  let dados;
  try {
    dados = await lerDadosDoGrupo(supabase, grupoId);
  } catch (e) {
    if (!(e instanceof FalhaNaExportacao)) throw e;
    console.error("[dados do grupo] falha ao ler:", e.message);
    return texto("Não consegui ler os dados agora. Tente de novo.", 500);
  }

  const { data: grupo } = await supabase.from("grupos").select("slug").eq("id", grupoId).maybeSingle();

  const { error: erroLog } = await createServiceClient()
    .from("admin_eventos")
    .insert({
      grupo_id: grupoId,
      ator_id: guarda.corretor.id,
      acao: "dados_do_grupo_exportados",
      detalhes: { quem: "gestor", ...contagemDaExportacao(dados) },
    });
  if (erroLog) {
    console.error("[dados do grupo] registro não gravado:", erroLog.message);
    return texto("Não consegui registrar a exportação. Tente de novo.", 500);
  }

  return new Response(new Uint8Array(arquivoDoGrupo(dados)), {
    headers: {
      "content-type": TIPO_XLSX,
      "content-disposition": `attachment; filename="${nomeDoArquivo(grupo?.slug ?? "imobiliaria")}"`,
      "cache-control": "no-store",
    },
  });
}

import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import {
  BUCKET_DAS_EXPORTACOES,
  DIAS_DA_COPIA_FINAL,
  HORAS_ANTES_DA_EXPORTACAO,
  exportacaoLiberadaEm,
  plataformaPodeExportar,
} from "@/lib/grupos/encerramentoRegras";
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
 * Só depois de 24 horas do cancelamento: sem a espera, o mesmo administrador
 * cancelaria, baixaria e desfaria em um minuto, e a regra do §4 dependeria só
 * de disciplina. Com ela, o site do grupo fica fora do ar um dia inteiro antes.
 *
 * Depois que a rotina dos 90 dias apagou os dados, o que sobra é a cópia
 * gravada antes no bucket privado: a rota devolve um link de 1 minuto para
 * ela, e o download fica num evento da PLATAFORMA (os eventos do grupo foram
 * apagados junto). A cópia também vence: 30 dias depois dos dados, a rotina
 * a apaga.
 */
const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
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
    .select("id, slug, cancelado_em, dados_apagados_em, exportacao_final_caminho, copia_final_apagada_em")
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
    if (grupo.copia_final_apagada_em) {
      return texto(
        `Os dados deste grupo foram apagados, e a cópia guardada também, em ${DATA.format(new Date(grupo.copia_final_apagada_em))} (${DIAS_DA_COPIA_FINAL} dias depois dos dados).`,
        410,
      );
    }
    if (!grupo.exportacao_final_caminho) return texto("Os dados deste grupo já foram apagados e não há cópia guardada.", 410);
    // Registrar ANTES de entregar: a cópia tem dados pessoais e o grupo não
    // tem mais eventos. Sem registro, sem download.
    const { error: erroDoRegistro } = await servico.from("admin_eventos").insert({
      grupo_id: null,
      acao: "copia_final_baixada",
      ator_id: null,
      ator_plataforma_user_id: guarda.userId,
      alvo_corretor_id: null,
      detalhes: { origem: "plataforma", slug: grupo.slug },
    });
    if (erroDoRegistro) {
      console.error(`[exportar grupo] download da cópia de ${id} não registrado: ${erroDoRegistro.message}`);
      return texto("Não consegui registrar o download. Tente de novo.", 500);
    }
    const { data: link, error: erroLink } = await servico.storage
      .from(BUCKET_DAS_EXPORTACOES)
      .createSignedUrl(grupo.exportacao_final_caminho, 60, { download: nomeDoArquivo(grupo.slug) });
    if (erroLink || !link) {
      console.error(`[exportar grupo] cópia final de ${id} sem link: ${erroLink?.message}`);
      return texto("Não consegui abrir a cópia guardada agora. Tente de novo.", 500);
    }
    return Response.redirect(link.signedUrl, 302);
  }

  if (!plataformaPodeExportar(grupo.cancelado_em)) {
    return texto(
      `A planilha fica disponível ${HORAS_ANTES_DA_EXPORTACAO} horas depois do cancelamento, a partir de ${DATA_E_HORA.format(exportacaoLiberadaEm(grupo.cancelado_em))}.`,
      403,
    );
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

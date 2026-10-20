import { exigirGestorNaAcao } from "@/lib/guardas";
import { COLUNAS_DA_FICHA, planilhaDasFichas, type FichaDoLead } from "@/lib/corretores/fichasDoCorretor";
import { gerarXlsx } from "@/lib/imoveis/xlsxEscrita";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * As fichas que o corretor que sai leva (fase 5, spec §9): só os leads que
 * ELE trouxe (`trazido_por = 'corretor'`, 0200), só a ficha, nunca a
 * conversa. Quem baixa é o gestor, que entrega a planilha a ele.
 *
 * A leitura é pela sessão do gestor (a RLS recorta o grupo) e filtra o
 * grupo de novo, por escrito. A entrega fica registrada em `admin_eventos`
 * (`fichas_exportadas`): é dado pessoal de clientes saindo da imobiliária.
 * Sem o registro, a planilha não sai.
 */
export const dynamic = "force-dynamic";

const PAGINA = 1000;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const texto = (msg: string, status: number) =>
  new Response(msg, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: Request) {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });
  const grupoId = guarda.corretor.grupoId;

  const corretorId = new URL(req.url).searchParams.get("corretor") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(corretorId)) return texto("Corretor inválido.", 400);

  const supabase = await createClient();
  const { data: corretor } = await supabase
    .from("corretores")
    .select("id, nome, slug")
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .maybeSingle();
  if (!corretor) return texto("Corretor não encontrado.", 404);

  const fichas: FichaDoLead[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("leads")
      .select(COLUNAS_DA_FICHA)
      .eq("grupo_id", grupoId)
      .eq("corretor_id", corretorId)
      .eq("trazido_por", "corretor")
      .order("created_at")
      // Desempate: a importação em lote dá o mesmo created_at a centenas de
      // fichas, e sem ele a página seguinte repete ou pula linhas.
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) {
      console.error("[fichas do corretor] falha ao ler:", error.message);
      return texto("Não consegui ler as fichas agora. Tente de novo.", 500);
    }
    fichas.push(...((data ?? []) as unknown as FichaDoLead[]));
    if (!data || data.length < PAGINA) break;
  }

  const ids = [...new Set(fichas.flatMap((f) => [f.imovel_interesse_id, f.empreendimento_id]).filter(Boolean))] as string[];
  const nomeDoImovel = new Map<string, string>();
  if (ids.length > 0) {
    const { data: imoveis, error: erroImoveis } = await supabase
      .from("empreendimentos")
      .select("id, nome")
      .eq("grupo_id", grupoId)
      .in("id", ids);
    // Sem os nomes, a planilha sairia sem "Imóvel de interesse" e a entrega
    // seria registrada como feita.
    if (erroImoveis) {
      console.error("[fichas do corretor] falha ao ler os imóveis:", erroImoveis.message);
      return texto("Não consegui ler as fichas agora. Tente de novo.", 500);
    }
    for (const i of imoveis ?? []) nomeDoImovel.set(i.id, i.nome);
  }

  const { error: erroLog } = await createServiceClient()
    .from("admin_eventos")
    .insert({
      ator_id: guarda.corretor.id,
      acao: "fichas_exportadas",
      alvo_corretor_id: corretorId,
      detalhes: { quantidade: fichas.length },
    });
  if (erroLog) {
    console.error("[fichas do corretor] registro não gravado:", erroLog.message);
    return texto("Não consegui registrar a exportação. Tente de novo.", 500);
  }

  const arquivo = gerarXlsx(planilhaDasFichas(fichas, nomeDoImovel));
  const nome = `fichas-${corretor.slug ?? "corretor"}`;
  return new Response(new Uint8Array(arquivo), {
    headers: {
      "content-type": XLSX,
      "content-disposition": `attachment; filename="${nome}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}

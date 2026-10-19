import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { contarLeadsPorImovel, planilhaDoCatalogo } from "@/lib/imoveis/planilhaDoCatalogo";
import { gerarXlsx } from "@/lib/imoveis/xlsxEscrita";
import { createClient } from "@/lib/supabase/server";

/**
 * O botão "Exportar Excel" da tela de Imóveis: o catálogo inteiro (rascunho
 * incluso) numa tabela só.
 *
 * A contagem de leads passa pela RLS da sessão: o corretor vê os leads dele,
 * o ADM os da equipe. Arquivado fica de fora, como em toda contagem do
 * painel (`leadArquivado.test.ts`). O PostgREST devolve no máximo 1000
 * linhas por resposta, então a leitura pagina: cortar ali faria imóvel
 * procurado parecer esquecido.
 */
export const dynamic = "force-dynamic";

const PAGINA = 1000;

export async function GET() {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const supabase = await createClient();
  const leads: { empreendimento_id: string | null; imovel_interesse_id: string | null }[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from("leads")
      .select("empreendimento_id, imovel_interesse_id")
      .is("arquivado_em", null)
      .order("id")
      .range(de, de + PAGINA - 1);
    if (error) {
      console.error("[exportar catálogo] falha ao contar leads:", error.message);
      return new Response("Não consegui contar os leads agora. Tente de novo.", { status: 500 });
    }
    leads.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }

  const imoveis = await getEmpreendimentosDoPainel();
  // Vazio aqui é falha de leitura (ela devolve [] em erro), não catálogo vazio:
  // uma planilha em branco seria entregue como se fosse a verdade.
  if (imoveis.length === 0) {
    return new Response("Não consegui ler o catálogo agora. Tente de novo.", { status: 500 });
  }
  const arquivo = gerarXlsx(planilhaDoCatalogo(imoveis, contarLeadsPorImovel(leads)));

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Response(new Uint8Array(arquivo), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="catalogo-${hoje}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}

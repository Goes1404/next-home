import { createClient } from "@/lib/supabase/server";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import { procuraPorImovel } from "@/lib/graficos/calculos";
import { CartaoDeGrafico, GraficoVazio } from "./BarrasHorizontais";
import { TabelaDeBarras } from "./TabelaDeBarras";

const DIAS = 90;
/** Os mais procurados; o resto vira uma frase, não trinta linhas. */
const TETO = 8;

/**
 * "O que vende e o que encalha?" (28/09/2026) — na tela de Imóveis.
 *
 * Leads, visitas e vendas por empreendimento nos últimos 90 dias, cada
 * coluna na sua escala. O lead conta pelo imóvel de interesse (o que ele
 * está conversando) ou, sem ele, pelo que o trouxe — uma vez só.
 *
 * O que NÃO aparece também decide: imóvel publicado sem nenhum lead no
 * período é candidato a anúncio ou a sair da vitrine, e o rodapé conta
 * quantos são.
 */
export async function ProcuraPorImovel({
  imoveis,
}: {
  imoveis: { id: string; nome: string; slug: string; publicado: boolean }[];
}) {
  const supabase = await createClient();
  const { corte, corteDia } = janelaDeDias(DIAS);
  const [{ data: leads }, { data: vendas }] = await Promise.all([
    supabase
      .from("leads")
      .select("empreendimento_id, imovel_interesse_id, etapa, visita_agendada_em")
      .is("arquivado_em", null)
      .gte("created_at", corte.toISOString()),
    supabase.from("vendas").select("empreendimento_id").eq("status", "ativa").gte("data_venda", corteDia),
  ]);

  const publicados = imoveis.filter((i) => i.publicado);
  const linhas = procuraPorImovel(
    publicados,
    (leads ?? []).map((l) => ({
      empreendimentoId: l.empreendimento_id,
      imovelInteresseId: l.imovel_interesse_id,
      etapa: l.etapa,
      visitaAgendadaEm: l.visita_agendada_em,
    })),
    (vendas ?? []).map((v) => ({ empreendimentoId: v.empreendimento_id })),
  );
  const comProcura = linhas.filter((l) => l.leads > 0 || l.vendas > 0);
  const semProcura = linhas.length - comProcura.length;

  return (
    <CartaoDeGrafico
      titulo="Os imóveis mais procurados"
      subtitulo={`Últimos ${DIAS} dias. Toque no imóvel para ver quem procurou por ele.`}
      rodape={
        comProcura.length > 0 && semProcura > 0
          ? `${semProcura} ${semProcura === 1 ? "imóvel publicado não teve" : "imóveis publicados não tiveram"} nenhum lead no período: vale anunciar ou rever a ficha.`
          : undefined
      }
    >
      {comProcura.length === 0 ? (
        <GraficoVazio texto="Quando os leads chegarem com o imóvel de interesse, aqui aparece o que vende e o que encalha." />
      ) : (
        <TabelaDeBarras
          legenda={`Leads, visitas e vendas por imóvel nos últimos ${DIAS} dias`}
          colunas={[
            { chave: "leads", rotulo: "Leads" },
            { chave: "visitas", rotulo: "Visitas" },
            { chave: "vendas", rotulo: "Vendas" },
          ]}
          linhas={comProcura.slice(0, TETO).map((l) => ({
            chave: l.id,
            rotulo: l.nome,
            href: `/corretor/leads?empreendimento=${l.id}&de=${corteDia}`,
            valores: { leads: l.leads, visitas: l.visitas, vendas: l.vendas },
          }))}
        />
      )}
    </CartaoDeGrafico>
  );
}

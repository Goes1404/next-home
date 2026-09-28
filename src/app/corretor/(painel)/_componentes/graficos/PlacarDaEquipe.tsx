import { createClient } from "@/lib/supabase/server";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import { placarDaEquipe } from "@/lib/graficos/calculos";
import { CartaoDeGrafico, GraficoVazio } from "./BarrasHorizontais";
import { TabelaDeBarras } from "./TabelaDeBarras";

/** A janela do placar: leads que chegaram e vendas fechadas nestes dias. */
const DIAS = 90;

/**
 * "Quem converte e quem só recebe?" (28/09/2026) — tela do gestor.
 *
 * A "Carga por corretor" já dizia quantos leads cada um TEM. Isto diz o que
 * cada um FAZ com eles: leads recebidos, visitas e vendas no mesmo recorte,
 * cada coluna na sua escala. Quem tem muito lead e pouca visita pede
 * conversa; quem converte bem pode receber mais.
 *
 * As vendas contam por quem REGISTROU (`vendas.corretor_id`). Co-corretagem
 * divide a comissão, não a venda: contar meia venda para cada um tiraria o
 * número do chão.
 */
export async function PlacarDaEquipe({ equipe }: { equipe: { id: string; nome: string }[] }) {
  const supabase = await createClient();
  const { corte, corteDia } = janelaDeDias(DIAS);
  const [{ data: leads }, { data: vendas }] = await Promise.all([
    supabase
      .from("leads")
      .select("corretor_id, etapa, visita_agendada_em")
      .is("arquivado_em", null)
      .gte("created_at", corte.toISOString()),
    supabase
      .from("vendas")
      .select("corretor_id")
      .eq("status", "ativa")
      .gte("data_venda", corteDia),
  ]);

  const linhas = placarDaEquipe(
    equipe,
    (leads ?? []).map((l) => ({
      corretorId: l.corretor_id,
      etapa: l.etapa,
      visitaAgendadaEm: l.visita_agendada_em,
    })),
    (vendas ?? []).map((v) => ({ corretorId: v.corretor_id })),
  );
  const algumMovimento = linhas.some((l) => l.leads > 0 || l.vendas > 0);

  return (
    <CartaoDeGrafico
      titulo="O que cada corretor faz com os leads"
      subtitulo={`Últimos ${DIAS} dias. Toque no nome para ver os contatos dele.`}
    >
      {!algumMovimento ? (
        <GraficoVazio texto="Quando os leads começarem a chegar, aqui aparece quanto cada corretor recebe, leva à visita e vende." />
      ) : (
        <TabelaDeBarras
          legenda={`Leads, visitas e vendas por corretor nos últimos ${DIAS} dias`}
          colunas={[
            { chave: "leads", rotulo: "Leads" },
            { chave: "visitas", rotulo: "Visitas" },
            { chave: "vendas", rotulo: "Vendas" },
          ]}
          linhas={linhas.map((l) => ({
            chave: l.corretorId,
            rotulo: l.nome,
            detalhe: l.conversao === null ? undefined : `${l.conversao}% das visitas viraram venda`,
            href: `/corretor/leads?corretor=${l.corretorId}`,
            valores: { leads: l.leads, visitas: l.visitas, vendas: l.vendas },
          }))}
        />
      )}
    </CartaoDeGrafico>
  );
}

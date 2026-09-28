import { createClient } from "@/lib/supabase/server";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import {
  origemDosLeads,
  PADROES_DO_CANAL,
  ROTULO_DO_CANAL,
  type Canal,
} from "@/lib/graficos/calculos";
import { BarrasHorizontais, CartaoDeGrafico, GraficoVazio } from "./BarrasHorizontais";

const DIAS = 90;

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: v < 100 ? 2 : 0 });

/**
 * "Onde meu dinheiro rende?" (28/09/2026) — na tela de Marketing.
 *
 * Leads dos últimos 90 dias por canal de origem, com visitas e, onde há
 * gasto conhecido, o custo por lead e por visita. Gasto só existe para
 * anúncio: o digitado nos impulsionamentos e o que a conta da Meta
 * sincroniza (quando está conectada). Portal, site e indicação não têm custo
 * registrado, e o gráfico diz isso em vez de inventar zero.
 *
 * A RLS recorta: o corretor vê os dele; o gestor, os da equipe.
 */
export async function OrigemDosLeads() {
  const supabase = await createClient();
  const { corte, corteDia } = janelaDeDias(DIAS);

  const [{ data: leads }, { data: impulsos }, { data: meta }] = await Promise.all([
    supabase
      .from("leads")
      .select("origem, etapa, visita_agendada_em")
      .is("arquivado_em", null)
      .gte("created_at", corte.toISOString()),
    supabase.from("impulsionamentos").select("valor_gasto").gte("ultimo_lead_em", corte.toISOString()),
    // Só o gestor lê o gasto da conta da Meta; para o corretor o erro vira
    // "sem gasto", e o custo dele sai só do que ele digitou.
    supabase.from("meta_ads_metricas").select("gasto").gte("dia", corteDia),
  ]);

  const gastoAnuncio =
    (impulsos ?? []).reduce((s, i) => s + (i.valor_gasto === null ? 0 : Number(i.valor_gasto)), 0) +
    (meta ?? []).reduce((s, m) => s + Number(m.gasto ?? 0), 0);

  const linhas = origemDosLeads(
    (leads ?? []).map((l) => ({ origem: l.origem, etapa: l.etapa, visitaAgendadaEm: l.visita_agendada_em })),
    gastoAnuncio > 0 ? { anuncio: gastoAnuncio } : {},
  );

  const detalheDe = (l: (typeof linhas)[number]) => {
    const partes = [`${l.visitas} ${l.visitas === 1 ? "visita" : "visitas"}`];
    if (l.fechados > 0) partes.push(`${l.fechados} ${l.fechados === 1 ? "venda" : "vendas"}`);
    if (l.custoPorLead !== null) partes.push(`${reais(l.custoPorLead)} por lead`);
    if (l.custoPorVisita !== null) partes.push(`${reais(l.custoPorVisita)} por visita`);
    else if (l.gasto !== null && l.leads > 0) partes.push("nenhuma visita ainda");
    return partes.join(" · ");
  };

  return (
    <CartaoDeGrafico
      titulo="De onde vêm os leads"
      subtitulo={`Últimos ${DIAS} dias. O custo aparece onde há gasto registrado: impulsionamentos e a conta de anúncios.`}
      rodape={
        gastoAnuncio > 0
          ? `Gasto em anúncios no período: ${reais(gastoAnuncio)}.`
          : "Nenhum gasto registrado ainda. Digite quanto gastou em Marketing → Impulsionamentos para ver o custo por lead."
      }
    >
      {linhas.length === 0 ? (
        <GraficoVazio texto="Quando os leads começarem a chegar, aqui aparece de onde veio cada um e quanto custou." />
      ) : (
        <BarrasHorizontais
          rotulo="Leads por canal de origem"
          linhas={linhas.map((l) => ({
            chave: l.canal,
            rotulo: ROTULO_DO_CANAL[l.canal as Canal],
            valor: l.leads,
            detalhe: detalheDe(l),
            href: PADROES_DO_CANAL[l.canal] ? `/corretor/leads?canal=${l.canal}&de=${corteDia}` : undefined,
          }))}
        />
      )}
    </CartaoDeGrafico>
  );
}

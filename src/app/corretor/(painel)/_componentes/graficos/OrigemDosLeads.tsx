import { createClient } from "@/lib/supabase/server";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import {
  origemDosLeads,
  type LinhaDeOrigem,
  PADROES_DO_CANAL,
  ROTULO_DO_CANAL,
  type Canal,
} from "@/lib/graficos/calculos";
import Link from "next/link";
import { CartaoDeGrafico, GraficoVazio } from "./Moldura";

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
 *
 * A forma é CARTÃO POR CANAL, não barra: cada canal carrega três números
 * de escalas diferentes (leads, visitas, custo), e o que se decide aqui é
 * "onde pôr dinheiro" olhando os três juntos. A parte do total vai num
 * medidor fino de uma cor só; o maior canal leva a etiqueta escrita.
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

  return <OrigemVisual linhas={linhas} gastoAnuncio={gastoAnuncio} corteDia={corteDia} />;
}

export function OrigemVisual({
  linhas,
  gastoAnuncio,
  corteDia,
}: {
  linhas: LinhaDeOrigem[];
  gastoAnuncio: number;
  corteDia: string;
}) {
  const totalLeads = linhas.reduce((t, l) => t + l.leads, 0);
  const lider = linhas[0]?.canal;

  return (
    <CartaoDeGrafico
      titulo="De onde vêm os leads"
      subtitulo={`Últimos ${DIAS} dias. Um cartão por canal: quantos chegaram, quantos visitaram e, onde há gasto, quanto custou cada um.`}
      rodape={
        gastoAnuncio > 0
          ? `Gasto em anúncios no período: ${reais(gastoAnuncio)}.`
          : "Nenhum gasto registrado ainda. Digite quanto gastou em Marketing → Impulsionamentos para ver o custo por lead."
      }
    >
      {linhas.length === 0 ? (
        <GraficoVazio texto="Quando os leads começarem a chegar, aqui aparece de onde veio cada um e quanto custou." />
      ) : (
        <ul aria-label="Leads por canal de origem" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {linhas.map((l) => {
            const parte = totalLeads > 0 ? Math.round((l.leads / totalLeads) * 100) : 0;
            const href = PADROES_DO_CANAL[l.canal] ? `/corretor/leads?canal=${l.canal}&de=${corteDia}` : undefined;
            const principal = l.canal === lider && linhas.length > 1;
            const corpo = (
              <>
                <span className="text-fluid-sm text-apoio block break-words">{ROTULO_DO_CANAL[l.canal as Canal]}</span>
                {principal && (
                  <span className="bg-acento-lavado text-acento-forte border-acento-linha text-fluid-xs mt-1 inline-block rounded-full border px-2 py-0.5 font-semibold">
                    maior fonte
                  </span>
                )}
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-titulo text-4xl leading-none font-bold tracking-[-0.03em] tabular-nums">{l.leads}</span>
                  <span className="text-fluid-xs text-apoio">{l.leads === 1 ? "lead" : "leads"} · {parte}%</span>
                </p>
                {/* A parte do total: um medidor só, na cor do módulo. */}
                <div className="bg-vidro-forte mt-3 h-1.5 overflow-hidden rounded-full" aria-hidden>
                  <div className="bg-acento h-full rounded-full" style={{ width: `${Math.max(parte, l.leads > 0 ? 3 : 0)}%` }} />
                </div>
                <dl className="text-fluid-xs mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
                  <dt className="text-tenue">Visitas</dt>
                  <dd className="text-titulo text-right font-semibold tabular-nums">{l.visitas}</dd>
                  <dt className="text-tenue">Vendas</dt>
                  <dd className="text-titulo text-right font-semibold tabular-nums">{l.fechados}</dd>
                  {l.custoPorLead !== null && (
                    <>
                      <dt className="text-tenue">Por lead</dt>
                      <dd className="text-titulo text-right font-semibold tabular-nums">{reais(l.custoPorLead)}</dd>
                    </>
                  )}
                  {l.gasto !== null && (
                    <>
                      <dt className="text-tenue">Por visita</dt>
                      <dd className="text-titulo text-right font-semibold tabular-nums">
                        {l.custoPorVisita !== null ? reais(l.custoPorVisita) : "sem visita"}
                      </dd>
                    </>
                  )}
                </dl>
              </>
            );
            return (
              <li key={l.canal}>
                {href ? (
                  <Link
                    href={href}
                    className={`border-linha hover:border-acento-linha active:bg-vidro-forte block h-full rounded-2xl border p-4 transition-[border-color,transform] hover:-translate-y-0.5 ${principal ? "bg-acento-lavado/40" : "bg-vidro"}`}
                  >
                    {corpo}
                  </Link>
                ) : (
                  <div className="border-linha bg-vidro h-full rounded-2xl border p-4">{corpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </CartaoDeGrafico>
  );
}

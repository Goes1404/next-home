import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import { placarDaEquipe, type LinhaDoPlacar } from "@/lib/graficos/calculos";
import { CartaoDeGrafico, GraficoVazio } from "./Moldura";
import { Anel } from "./Anel";

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
  return <PlacarVisual linhas={linhas} />;
}

export function PlacarVisual({ linhas }: { linhas: LinhaDoPlacar[] }) {
  const algumMovimento = linhas.some((l) => l.leads > 0 || l.vendas > 0);
  const maximo = {
    leads: Math.max(1, ...linhas.map((l) => l.leads)),
    visitas: Math.max(1, ...linhas.map((l) => l.visitas)),
    vendas: Math.max(1, ...linhas.map((l) => l.vendas)),
  };

  return (
    <CartaoDeGrafico
      titulo="O que cada corretor faz com os leads"
      subtitulo={`Últimos ${DIAS} dias, ordenado por vendas. O anel é quanto das visitas virou venda. Toque para ver os contatos.`}
    >
      {!algumMovimento ? (
        <GraficoVazio texto="Quando os leads começarem a chegar, aqui aparece quanto cada corretor recebe, leva à visita e vende." />
      ) : (
        <ol aria-label={`Placar da equipe nos últimos ${DIAS} dias`} className="space-y-2">
          {linhas.map((l, i) => {
            const lider = i === 0 && l.vendas > 0;
            return (
              <li key={l.corretorId}>
                <Link
                  href={`/corretor/leads?corretor=${l.corretorId}`}
                  className={`border-linha hover:border-acento-linha active:bg-vidro-forte block rounded-2xl border p-3 transition-[border-color,transform] hover:-translate-y-0.5 sm:p-4 ${lider ? "bg-acento-lavado/40" : "bg-vidro"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-fluid-xs text-tenue w-5 shrink-0 text-center font-semibold tabular-nums">{i + 1}</span>
                    <span
                      aria-hidden
                      className={`text-fluid-sm flex size-10 shrink-0 items-center justify-center rounded-full font-bold ${lider ? "bg-acento text-sobre-cor" : "bg-vidro-forte text-titulo"}`}
                    >
                      {iniciais(l.nome)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-fluid-sm text-titulo block truncate font-medium">{l.nome}</span>
                      {lider && <span className="text-fluid-xs text-acento-forte font-semibold">mais vendas do período</span>}
                    </span>
                    <Anel valor={l.conversao} rotulo={`Visitas de ${l.nome} que viraram venda`} />
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-3 pl-8 sm:pl-[4.25rem]">
                    {(["leads", "visitas", "vendas"] as const).map((k) => (
                      <div key={k} className="min-w-0">
                        <dt className="text-fluid-xs text-tenue">{ROTULO[k]}</dt>
                        <dd className="text-fluid-base text-titulo font-bold tabular-nums">{l[k]}</dd>
                        <dd aria-hidden className="bg-vidro-forte mt-1 h-1.5 overflow-hidden rounded-full">
                          <span
                            className="bg-acento block h-full rounded-full"
                            style={{ width: `${l[k] > 0 ? Math.max(6, Math.round((l[k] / maximo[k]) * 100)) : 0}%` }}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </CartaoDeGrafico>
  );
}

const ROTULO = { leads: "Leads", visitas: "Visitas", vendas: "Vendas" } as const;

function iniciais(nome: string): string {
  const partes = nome.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0];
  const ultima = partes.length > 1 ? partes[partes.length - 1] : "";
  return (primeira[0] + (ultima[0] ?? "")).toUpperCase();
}

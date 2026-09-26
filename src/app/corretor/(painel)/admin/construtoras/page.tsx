import type { Metadata } from "next";
import Link from "next/link";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import {
  linhasDoRelatorio,
  PERIODOS_DO_RELATORIO,
  periodoDoRelatorio,
  totaisDoRelatorio,
} from "@/lib/admin/relatorioConstrutora";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { BotaoImprimir } from "./BotaoImprimir";

export const metadata: Metadata = { title: "Relatório por construtora" };

/**
 * O que cada construtora parceira recebeu desta imobiliária (26/09/2026):
 * leads, visitas e vendas por empreendimento, no período. Só contagens e
 * valor de venda — nenhum dado de cliente. Imprime ou vira PDF pelo
 * navegador, para mandar à construtora.
 */
export default async function RelatorioConstrutoraPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; dias?: string }>;
}) {
  await exigirGestorNaPagina();
  const { c, dias: diasParam } = await searchParams;
  const dias = periodoDoRelatorio(diasParam);
  const janela = janelaDeDias(dias);

  const supabase = await createClient();
  const { data: todos } = await supabase
    .from("empreendimentos")
    .select("id, nome, construtora")
    .not("construtora", "is", null)
    .order("nome", { ascending: true });
  const construtoras = [...new Set((todos ?? []).map((e) => e.construtora!.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const escolhida = c && construtoras.includes(c) ? c : (construtoras[0] ?? null);
  const imoveis = (todos ?? []).filter((e) => e.construtora?.trim() === escolhida).map((e) => ({ id: e.id, nome: e.nome }));
  const ids = imoveis.map((i) => i.id);

  const [{ data: leads }, { data: vendas }] = ids.length
    ? await Promise.all([
        supabase
          .from("leads")
          .select("empreendimento_id, etapa, visita_agendada_em")
          .in("empreendimento_id", ids)
          .is("arquivado_em", null)
          .gte("created_at", janela.corte.toISOString())
          .limit(10000),
        supabase
          .from("vendas")
          .select("empreendimento_id, valor_venda")
          .in("empreendimento_id", ids)
          .eq("status", "ativa")
          .gte("data_venda", janela.corteDia),
      ])
    : [{ data: [] }, { data: [] }];

  const linhas = linhasDoRelatorio(
    imoveis,
    (leads ?? []).map((l) => ({ empreendimentoId: l.empreendimento_id, etapa: l.etapa, visitaAgendadaEm: l.visita_agendada_em })),
    (vendas ?? []).map((v) => ({ empreendimentoId: v.empreendimento_id, valor: Number(v.valor_venda) })),
  );
  const total = totaisDoRelatorio(linhas);

  return (
    <div className="space-y-6">
      <CabecalhoDeTela secao="Administração" titulo="Relatório por construtora" descricao="Leads, visitas e vendas que cada empreendimento recebeu. Sem dado de cliente: pode mandar para a construtora." />
      <div className="print:hidden">
        <AbasAdmin ativa="/corretor/admin/construtoras" />
      </div>

      {construtoras.length === 0 ? (
        <p className="cartao p-4 text-fluid-sm text-corpo">Nenhum imóvel tem construtora cadastrada.</p>
      ) : (
        <>
          <form className="flex flex-wrap items-end gap-3 print:hidden">
            <label className="text-fluid-xs text-apoio">
              Construtora
              <select
                name="c"
                defaultValue={escolhida ?? undefined}
                className="mt-1 block select-seta text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3"
              >
                {construtoras.map((nome) => (
                  <option key={nome} value={nome}>
                    {nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-fluid-xs text-apoio">
              Período
              <select
                name="dias"
                defaultValue={String(dias)}
                className="mt-1 block select-seta text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3"
              >
                {PERIODOS_DO_RELATORIO.map((d) => (
                  <option key={d} value={d}>
                    Últimos {d} dias
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor">
              Ver
            </button>
            <BotaoImprimir />
          </form>

          <section className="cartao p-5 space-y-4">
            <h2 className="text-fluid-lg font-bold text-titulo">
              {escolhida} · últimos {dias} dias
            </h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Leads", String(total.leads)],
                ["Visitas", String(total.visitas)],
                ["Vendas", String(total.vendas)],
                ["VGV", formatarMoedaBRL(total.vgv)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="rounded-xl border border-linha p-3">
                  <dt className="text-fluid-xs text-apoio">{rotulo}</dt>
                  <dd className="text-fluid-lg font-bold text-titulo tabular-nums break-words">{valor}</dd>
                </div>
              ))}
            </dl>
            <ul className="divide-y divide-linha">
              {linhas.map((l) => (
                <li key={l.empreendimentoId} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <Link
                    href={`/corretor/leads?empreendimento=${l.empreendimentoId}`}
                    className="text-fluid-sm font-semibold text-titulo min-w-0 break-words underline decoration-transparent underline-offset-2 hover:decoration-current"
                  >
                    {l.nome}
                  </Link>
                  <span className="text-fluid-xs text-apoio tabular-nums">
                    {l.leads} leads · {l.visitas} visitas · {l.vendas} vendas
                    {l.vgv > 0 ? ` · ${formatarMoedaBRL(l.vgv)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-fluid-xs text-tenue">
              Leads contados pela data de entrada; vendas pela data da venda, sem distratos. Visita conta quem teve
              visita marcada ou chegou à etapa de visita.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

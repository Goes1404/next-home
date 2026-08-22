import type { Metadata } from "next";
import Link from "next/link";
import { getEquipeAtiva, getLeadsDoFunil } from "@/lib/corretorSessao";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { contarPorEtapa, montarResumo, paradosHa, taxaConversao } from "@/lib/admin/resumos";
import { createClient } from "@/lib/supabase/server";
import { ETAPA_LABEL, ETAPAS_FUNIL } from "@/lib/types";

export const metadata: Metadata = { title: "Visão geral" };

/**
 * O retrato do negócio numa tela.
 *
 * Nenhuma tabela nova: tudo sai do que já existe, agora que a RLS entrega o
 * conjunto inteiro ao gestor. As barras são CSS puro — os números aqui são
 * poucos e comparativos, e uma biblioteca de gráfico custaria mais peso do
 * que entrega de informação.
 *
 * Nota de escala: agregar em JS a partir de `getLeadsDoFunil()` é certo com
 * centenas de leads e errado com dezenas de milhares. Quando doer, isto vira
 * uma RPC de agregação — não antes.
 */
function Kpi({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="border-linha bg-superficie rounded-2xl border p-4">
      <p className="text-fluid-xs text-tenue">{rotulo}</p>
      <p className="text-fluid-xl font-bold text-titulo">{valor}</p>
      {detalhe && <p className="text-fluid-xs text-apoio mt-0.5">{detalhe}</p>}
    </div>
  );
}

export default async function AdminVisaoGeralPage() {
  await exigirGestorNaPagina();

  const supabase = await createClient();
  const [leads, equipe, { data: funilWhats }] = await Promise.all([
    getLeadsDoFunil(),
    getEquipeAtiva(),
    supabase
      .from("whatsapp_funil_metricas")
      .select("conversas, conversas_com_lead, leads_quentes, visitas_agendadas, em_negociacao"),
  ]);

  const resumo = montarResumo(leads, equipe);
  const porEtapa = contarPorEtapa(leads);
  const conversao = taxaConversao(leads);
  const parados = paradosHa(leads, 15);
  const semDono = leads.filter((l) => !l.corretor).length;

  const whats = (funilWhats ?? []).reduce(
    (acc, l) => ({
      conversas: acc.conversas + (l.conversas ?? 0),
      quentes: acc.quentes + (l.leads_quentes ?? 0),
      visitas: acc.visitas + (l.visitas_agendadas ?? 0),
    }),
    { conversas: 0, quentes: 0, visitas: 0 },
  );

  const maxEtapa = Math.max(1, ...Object.values(porEtapa));
  const maxCorretor = Math.max(1, ...resumo.map((r) => r.total));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Leads na base" valor={String(leads.length)} detalhe={`${semDono} sem dono`} />
        <Kpi
          rotulo="Conversão"
          valor={conversao === null ? "—" : `${conversao}%`}
          detalhe="dos leads já concluídos"
        />
        <Kpi rotulo="Parados há 15+ dias" valor={String(parados.length)} detalhe="pedem cutucão" />
        <Kpi
          rotulo="Visitas pelo WhatsApp"
          valor={String(whats.visitas)}
          detalhe={`${whats.conversas} conversas · ${whats.quentes} quentes`}
        />
      </div>

      <section className="border-linha bg-superficie rounded-2xl border p-5">
        <h2 className="text-fluid-base font-bold text-titulo">Onde está cada contato</h2>
        <ul className="mt-4 space-y-2.5">
          {ETAPAS_FUNIL.map((etapa) => {
            const total = porEtapa[etapa] ?? 0;
            return (
              <li key={etapa} className="flex items-center gap-3">
                <span className="text-fluid-xs text-apoio w-36 shrink-0">{ETAPA_LABEL[etapa]}</span>
                <span className="bg-campo h-2.5 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-acento block h-full rounded-full"
                    style={{ width: `${(total / maxEtapa) * 100}%` }}
                  />
                </span>
                <span className="text-fluid-xs w-8 shrink-0 text-right font-bold text-titulo">
                  {total}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-linha bg-superficie rounded-2xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-fluid-base font-bold text-titulo">Carga por corretor</h2>
          <Link
            href="/corretor/admin/leads"
            className="text-fluid-xs text-acento-suave font-medium underline-offset-4 hover:underline"
          >
            Redistribuir →
          </Link>
        </div>
        <ul className="mt-4 space-y-2.5">
          {resumo.map((linha) => (
            <li key={linha.id} className="flex items-center gap-3">
              <span className="text-fluid-xs text-apoio w-36 shrink-0 truncate">
                {linha.nome}
                {linha.emPausa && " (pausa)"}
              </span>
              <span className="bg-campo h-2.5 flex-1 overflow-hidden rounded-full">
                <span
                  className="bg-acento-suave block h-full rounded-full"
                  style={{ width: `${(linha.total / maxCorretor) * 100}%` }}
                />
              </span>
              <span className="text-fluid-xs w-8 shrink-0 text-right font-bold text-titulo">
                {linha.total}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

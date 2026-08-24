import type { Metadata } from "next";
import Link from "next/link";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { getEquipeAtiva } from "@/lib/corretorSessao";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { getAgregadoDaEquipe } from "@/lib/admin/agregados";
import { createClient } from "@/lib/supabase/server";
import { ETAPA_LABEL, ETAPAS_FUNIL } from "@/lib/types";

export const metadata: Metadata = { title: "Visão geral" };

/**
 * O retrato do negócio numa tela.
 *
 * Os números vêm de `getAgregadoDaEquipe` — uma consulta magra, sem joins —
 * e não mais da mesma query que desenha o quadro do funil: contar e listar
 * são necessidades diferentes, e o teto do quadro faria as contas mentirem.
 *
 * Todo número aqui é CLICÁVEL e cai na lista já filtrada (roadmap F5). Um
 * KPI que não leva a lugar nenhum obriga o gestor a refazer o filtro à mão
 * para ver de quem o número é feito.
 */
function Kpi({
  rotulo,
  valor,
  detalhe,
  href,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  href?: string;
}) {
  const conteudo = (
    <>
      <p className="text-fluid-xs text-tenue">{rotulo}</p>
      <p className="text-fluid-xl text-titulo font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-fluid-xs text-apoio mt-0.5">{detalhe}</p>}
    </>
  );

  if (!href) {
    return <div className="border-linha bg-superficie rounded-2xl border p-4">{conteudo}</div>;
  }

  return (
    <Link
      href={href}
      className="border-linha bg-superficie hover:border-acento-linha rounded-2xl border p-4 transition-colors"
    >
      {conteudo}
    </Link>
  );
}

export default async function AdminVisaoGeralPage() {
  await exigirGestorNaPagina();

  const supabase = await createClient();
  const equipe = await getEquipeAtiva();

  const [agregado, { data: funilWhats }] = await Promise.all([
    getAgregadoDaEquipe(equipe),
    supabase
      .from("whatsapp_funil_metricas")
      .select("conversas, conversas_com_lead, leads_quentes, visitas_agendadas, em_negociacao"),
  ]);

  const whats = (funilWhats ?? []).reduce(
    (acc, l) => ({
      conversas: acc.conversas + (l.conversas ?? 0),
      quentes: acc.quentes + (l.leads_quentes ?? 0),
      visitas: acc.visitas + (l.visitas_agendadas ?? 0),
    }),
    { conversas: 0, quentes: 0, visitas: 0 },
  );

  const maxEtapa = Math.max(1, ...Object.values(agregado.porEtapa));
  const maxCorretor = Math.max(1, ...agregado.porCorretor.map((r) => r.total));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-fluid-2xl text-titulo font-bold">Administração</h1>
        <p className="text-fluid-sm text-apoio mt-1">
          O retrato da operação. Todo número aqui abre a lista por trás dele.
        </p>
      </div>

      <AbasAdmin ativa="geral" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          rotulo="Leads na base"
          valor={String(agregado.total)}
          detalhe={`${agregado.semDono} sem dono`}
          href="/corretor/leads"
        />
        <Kpi
          rotulo="Conversão"
          valor={agregado.conversao === null ? "—" : `${agregado.conversao}%`}
          detalhe="dos leads já concluídos"
          href="/corretor/leads?filtro=frios"
        />
        <Kpi
          rotulo="Parados há 15+ dias"
          valor={String(agregado.parados15d)}
          detalhe="pedem cutucão"
          href="/corretor/leads?filtro=conversa"
        />
        <Kpi
          rotulo="Visitas pelo WhatsApp"
          valor={String(whats.visitas)}
          detalhe={`${whats.conversas} conversas · ${whats.quentes} quentes`}
          href="/corretor/conversas"
        />
      </div>

      <section className="border-linha bg-superficie rounded-2xl border p-5">
        <h2 className="text-fluid-base text-titulo font-bold">Onde está cada contato</h2>
        <ul className="mt-4 space-y-2.5">
          {ETAPAS_FUNIL.map((etapa) => {
            const total = agregado.porEtapa[etapa] ?? 0;
            return (
              <li key={etapa}>
                <Link
                  href={`/corretor/leads?etapa=${etapa}`}
                  className="flex items-center gap-3 transition-opacity hover:opacity-80"
                >
                  <span className="text-fluid-xs text-apoio w-36 shrink-0">
                    {ETAPA_LABEL[etapa]}
                  </span>
                  <span className="bg-campo h-2.5 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-acento block h-full rounded-full"
                      style={{ width: `${(total / maxEtapa) * 100}%` }}
                    />
                  </span>
                  <span className="text-fluid-xs text-titulo w-8 shrink-0 text-right font-bold tabular-nums">
                    {total}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-linha bg-superficie rounded-2xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-fluid-base text-titulo font-bold">Carga por corretor</h2>
          <Link
            href="/corretor/admin/leads"
            className="text-fluid-xs text-acento-suave font-medium underline-offset-4 hover:underline"
          >
            Redistribuir →
          </Link>
        </div>
        <ul className="mt-4 space-y-2.5">
          {agregado.porCorretor.map((linha) => (
            <li key={linha.id}>
              <Link
                href={`/corretor/leads?corretor=${linha.id}`}
                className="flex items-center gap-3 transition-opacity hover:opacity-80"
              >
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
                <span className="text-fluid-xs text-titulo w-8 shrink-0 text-right font-bold tabular-nums">
                  {linha.total}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

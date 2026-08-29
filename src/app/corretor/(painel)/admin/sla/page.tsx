import type { Metadata } from "next";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { inicioDaJanelaEmDias } from "@/lib/tempoServidor";

export const metadata: Metadata = { title: "SLA de atendimento" };

function duracao(segundos: number | null) {
  if (segundos === null) return "—";
  if (segundos < 60) return `${segundos}s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)}min`;
  return `${(segundos / 3600).toFixed(1).replace(".", ",")}h`;
}

function mediana(valores: number[]) {
  if (!valores.length) return null;
  const ordem = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordem.length / 2);
  return ordem.length % 2 ? ordem[meio] : Math.round((ordem[meio - 1] + ordem[meio]) / 2);
}

export default async function SlaPage() {
  await exigirGestorNaPagina();
  const supabase = await createClient();
  const corte = inicioDaJanelaEmDias(30);
  const { data, error } = await supabase
    .from("sla_leads_metricas")
    .select("lead_id, iniciado_em, segundos_automatico, segundos_humano, canal_automatico, canal_humano")
    .gte("iniciado_em", corte)
    .order("iniciado_em", { ascending: false });

  const linhas = data ?? [];
  const automaticos = linhas.flatMap((l) => l.segundos_automatico === null ? [] : [l.segundos_automatico]);
  const humanos = linhas.flatMap((l) => l.segundos_humano === null ? [] : [l.segundos_humano]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-fluid-2xl font-bold text-titulo">SLA de atendimento</h1>
        <p className="text-fluid-sm mt-1 text-apoio">Primeira resposta automática e humana nos últimos 30 dias.</p>
      </div>
      <AbasAdmin ativa="sla" />
      {error ? (
        <p className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4 text-fluid-sm text-red-200">Não foi possível ler o SLA. Confirme a migration 0068.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi titulo="Leads medidos" valor={String(linhas.length)} />
            <Kpi titulo="Mediana automática" valor={duracao(mediana(automaticos))} />
            <Kpi titulo="Mediana humana" valor={duracao(mediana(humanos))} />
            <Kpi titulo="Sem resposta humana" valor={String(linhas.length - humanos.length)} />
          </div>
          <section className="rounded-2xl border border-linha bg-superficie p-4 sm:p-5">
            <h2 className="text-fluid-base font-semibold text-titulo">Cobertura da medição</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Cobertura titulo="Resposta automática" respondidos={automaticos.length} total={linhas.length} />
              <Cobertura titulo="Resposta humana" respondidos={humanos.length} total={linhas.length} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return <div className="rounded-2xl border border-linha bg-superficie p-4"><p className="text-fluid-xs text-tenue">{titulo}</p><p className="text-fluid-xl mt-1 font-bold tabular-nums text-titulo">{valor}</p></div>;
}

function Cobertura({ titulo, respondidos, total }: { titulo: string; respondidos: number; total: number }) {
  const percentual = total ? Math.round((respondidos / total) * 100) : 0;
  return <div className="rounded-xl bg-vidro p-4"><div className="flex justify-between gap-3 text-fluid-sm"><span className="text-corpo">{titulo}</span><span className="font-medium tabular-nums text-titulo">{percentual}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-campo"><span className="block h-full rounded-full bg-acento" style={{ width: `${percentual}%` }} /></div><p className="text-fluid-xs mt-2 text-tenue">{respondidos} de {total} leads</p></div>;
}

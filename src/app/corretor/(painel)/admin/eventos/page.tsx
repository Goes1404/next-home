import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Monitor de eventos" };

const STATUS_LABEL = {
  pendente: "Pendente",
  processando: "Processando",
  entregue: "Entregue",
  erro: "Erro",
  descartado: "Descartado",
} as const;

const STATUS_COR = {
  pendente: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  processando: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  entregue: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  erro: "border-red-400/25 bg-red-400/10 text-red-200",
  descartado: "border-linha bg-vidro text-tenue",
} as const;

function dataCurta(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(valor));
}

function Kpi({ titulo, valor, icone: Icone }: { titulo: string; valor: number; icone: typeof Clock3 }) {
  return (
    <div className="rounded-2xl border border-linha bg-superficie p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-fluid-xs text-tenue">{titulo}</p>
        <Icone className="h-4 w-4 text-acento-suave" aria-hidden="true" />
      </div>
      <p className="text-fluid-xl mt-1 font-bold tabular-nums text-titulo">{valor}</p>
    </div>
  );
}

export default async function MonitorEventosPage() {
  await exigirGestorNaPagina();
  const supabase = await createClient();

  const [pendentes, erros, entregues, eventos, entregas] = await Promise.all([
    supabase.from("event_outbox").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    supabase.from("event_outbox").select("id", { count: "exact", head: true }).eq("status", "erro"),
    supabase.from("event_outbox").select("id", { count: "exact", head: true }).eq("status", "entregue"),
    supabase.from("marketing_eventos").select("id", { count: "exact", head: true }),
    supabase
      .from("event_outbox")
      .select("id, destino, status, tentativas, proxima_tentativa_em, ultimo_erro, criado_em, atualizado_em, evento:marketing_eventos(event_id, tipo, lead_id, ocorrido_em)")
      .order("atualizado_em", { ascending: false })
      .limit(100),
  ]);

  const linhas = entregas.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-fluid-2xl font-bold text-titulo">Monitor de eventos</h1>
        <p className="text-fluid-sm mt-1 max-w-prose text-apoio">
          Saúde da fila transacional que liga fatos do CRM às integrações e aos painéis.
        </p>
      </div>

      <AbasAdmin ativa="eventos" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Eventos registrados" valor={eventos.count ?? 0} icone={RefreshCw} />
        <Kpi titulo="Pendentes" valor={pendentes.count ?? 0} icone={Clock3} />
        <Kpi titulo="Com erro" valor={erros.count ?? 0} icone={AlertTriangle} />
        <Kpi titulo="Entregues" valor={entregues.count ?? 0} icone={CheckCircle2} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-linha bg-superficie">
        <div className="border-b border-linha px-4 py-3 sm:px-5">
          <h2 className="text-fluid-base font-semibold text-titulo">Últimas entregas</h2>
          <p className="text-fluid-xs mt-0.5 text-tenue">Até 100 registros, mais recentes primeiro.</p>
        </div>

        {entregas.error ? (
          <div className="px-4 py-8 text-center sm:px-5">
            <p className="text-fluid-sm text-red-300">Não foi possível consultar a outbox.</p>
            <p className="text-fluid-xs mt-1 text-tenue">Confirme se a migration 0065 foi aplicada.</p>
          </div>
        ) : linhas.length === 0 ? (
          <div className="px-4 py-8 text-center sm:px-5">
            <p className="text-fluid-sm text-corpo">Nenhum evento registrado ainda.</p>
            <p className="text-fluid-xs mt-1 text-tenue">O primeiro lead novo criará o evento lead.criado.</p>
          </div>
        ) : (
          <ul className="divide-y divide-linha">
            {linhas.map((linha) => {
              const evento = linha.evento;
              const status = linha.status as keyof typeof STATUS_LABEL;
              return (
                <li key={linha.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-fluid-sm break-all font-medium text-titulo">
                          {evento?.tipo ?? "Evento removido"}
                        </p>
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${STATUS_COR[status]}`}>
                          {STATUS_LABEL[status]}
                        </span>
                      </div>
                      <p className="text-fluid-xs mt-1 break-all text-tenue">
                        {evento?.event_id ?? linha.id} · destino {linha.destino}
                      </p>
                      {linha.ultimo_erro && (
                        <p className="text-fluid-xs mt-2 break-words rounded-lg bg-red-400/10 px-3 py-2 text-red-200">
                          {linha.ultimo_erro}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-fluid-xs tabular-nums text-apoio">{linha.tentativas} tentativa(s)</p>
                      <p className="text-fluid-xs mt-0.5 tabular-nums text-tenue">
                        Atualizado {dataCurta(linha.atualizado_em)}
                      </p>
                      {(status === "pendente" || status === "erro") && (
                        <p className="text-fluid-xs mt-0.5 tabular-nums text-tenue">
                          Próxima {dataCurta(linha.proxima_tentativa_em)}
                        </p>
                      )}
                      {evento?.lead_id && (
                        <Link
                          href={`/corretor/leads/${evento.lead_id}`}
                          className="mt-2 inline-flex min-h-11 items-center text-fluid-sm text-acento-suave underline-offset-4 hover:underline focus-visible:underline"
                        >
                          Abrir lead
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

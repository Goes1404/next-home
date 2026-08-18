import type { Metadata } from "next";
import { getMeusLeads } from "@/lib/corretorSessao";
import type { Lead } from "@/lib/types";

export const metadata: Metadata = { title: "Minhas Visitas" };

const horaFormatada = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Visitas ordenadas por data: sem data marcada primeiro (precisam de atenção), depois as mais próximas. */
function ordenarVisitas(visitas: Lead[]): Lead[] {
  return [...visitas].sort((a, b) => {
    if (!a.visitaAgendadaEm && !b.visitaAgendadaEm) return 0;
    if (!a.visitaAgendadaEm) return -1;
    if (!b.visitaAgendadaEm) return 1;
    return a.visitaAgendadaEm.localeCompare(b.visitaAgendadaEm);
  });
}

export default async function VisitasPage() {
  const leads = await getMeusLeads();
  // Visita É o lead na etapa "visita_agendada" (migration 0009) — não um
  // registro à parte. Ver CampoVisita.tsx para onde a data é definida.
  const visitas = ordenarVisitas(leads.filter((lead) => lead.etapa === "visita_agendada"));

  return (
    <div>
      <h1 className="text-fluid-2xl text-titulo">Agenda de Visitas</h1>
      <p className="text-fluid-sm mt-2 text-apoio">
        Leads na etapa &ldquo;Visita agendada&rdquo; do funil, ordenados pelo horário marcado.
      </p>

      {visitas.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-linha bg-superficie p-6">
          <p className="text-fluid-sm text-corpo">
            Nenhuma visita agendada no momento. Mova um lead para a etapa &ldquo;Visita
            agendada&rdquo; no funil e marque a data para ele aparecer aqui.
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {visitas.map((lead) => {
            const hora = lead.visitaAgendadaEm
              ? horaFormatada.format(new Date(lead.visitaAgendadaEm))
              : null;
            const endereco = lead.empreendimento?.endereco ?? lead.empreendimento?.nome;
            const linkMaps = endereco
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`
              : null;

            return (
              <article
                key={lead.id}
                className="rounded-2xl border border-linha bg-superficie p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-lg text-titulo">
                      {hora ? `${hora} — ${lead.nome}` : lead.nome}
                    </p>
                    <p className="text-fluid-sm mt-0.5 text-apoio">
                      {lead.empreendimento?.nome ?? "Imóvel não informado"}
                    </p>
                  </div>
                  <div>
                    <span className="text-fluid-xs rounded-full bg-etapa-azul-lavado px-2.5 py-1 font-medium text-etapa-azul">
                      {hora ? "Agendada" : "Sem horário"}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  {linkMaps && (
                    <a
                      href={linkMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl bg-elevado px-4 py-2.5 text-center text-sm font-medium text-corpo transition-colors hover:bg-vidro-forte"
                    >
                      Ir para o imóvel (GPS)
                    </a>
                  )}
                  {lead.telefone && (
                    <a
                      href={`tel:${lead.telefone}`}
                      className="flex-1 rounded-xl border border-acento-linha bg-acento-lavado px-4 py-2.5 text-center text-sm font-medium text-acento-suave transition-colors hover:opacity-85"
                    >
                      Ligar
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

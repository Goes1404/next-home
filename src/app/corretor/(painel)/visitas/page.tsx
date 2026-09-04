import type { Metadata } from "next";
import { AbasLeads } from "@/app/corretor/(painel)/_componentes/AbasLeads";
import { BuscaLeads } from "@/app/corretor/(painel)/_componentes/BuscaLeads";
import { getCorretorLogado, getLeadsDeVisita } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { GradeDaSemana } from "./_componentes/GradeDaSemana";

export const metadata: Metadata = { title: "Minhas Visitas" };

const horaFormatada = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const buscaParam = params.busca;
  const busca = (Array.isArray(buscaParam) ? buscaParam[0] : buscaParam) ?? "";

  // Visita É o lead na etapa "visita_agendada" (migration 0009) — não um
  // registro à parte. Ver CampoVisita.tsx para onde a data é definida.
  // A query já vem recortada e ordenada (sem data primeiro) — antes esta
  // tela baixava a carteira inteira para filtrar meia dúzia de visitas.
  const visitas = await getLeadsDeVisita(busca);

  /*
   * A grade semanal de disponibilidade (0073). É o que a assistente lê
   * para oferecer horário que EXISTE — sem ela, ela fala de horário de
   * cabeça, e o eval de 31/08 mediu o custo disso.
   */
  const corretor = await getCorretorLogado();
  const { data: grade } = corretor
    ? await (await createClient())
        .from("corretor_disponibilidade")
        .select("dia_semana, hora_inicio, hora_fim")
        .eq("corretor_id", corretor.id)
    : { data: null };

  return (
    <div>
      <h1 className="text-fluid-2xl text-titulo">Agenda de Visitas</h1>
      <p className="text-fluid-sm mt-2 text-apoio">
        Leads com visita marcada, ordenados pelo horário.
      </p>

      <div className="mt-6">
        <GradeDaSemana
          inicial={(grade ?? []).map((f) => ({
            diaSemana: f.dia_semana,
            horaInicio: f.hora_inicio,
            horaFim: f.hora_fim,
          }))}
        />
      </div>

      <BuscaLeads className="mt-6" />
      <div className="mt-3">
        <AbasLeads ativa="/corretor/visitas" visitas={busca ? undefined : visitas.length} />
      </div>

      {visitas.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-linha bg-superficie p-6">
          <p className="text-fluid-sm text-corpo">
            {busca
              ? `Nenhuma visita marcada para “${busca}”.`
              : "Nenhuma visita agendada no momento. Mova um lead para a etapa “Visita” no funil e marque a data para ele aparecer aqui."}
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
                    <span className="text-fluid-xs rounded-full bg-etapa-visita-lavado px-2.5 py-1 font-medium text-etapa-visita">
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

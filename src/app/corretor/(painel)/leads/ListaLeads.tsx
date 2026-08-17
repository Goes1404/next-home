"use client";

import { useState } from "react";
import Link from "next/link";
import { CartaoLead } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import type { Lead } from "@/lib/types";

type Filtro = "todos" | "novos" | "negociando" | "frios";

export function ListaLeads({ leads, gestor }: { leads: Lead[]; gestor: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");

  const leadsFiltrados = leads.filter((lead) => {
    if (filtro === "todos") return true;
    if (filtro === "novos") return lead.etapa === "novo" || lead.etapa === "primeiro_contato";
    if (filtro === "negociando") return lead.etapa === "visita_agendada" || lead.etapa === "proposta_enviada" || lead.etapa === "negociacao";
    if (filtro === "frios") return lead.etapa === "perdido" || lead.etapa === "fechado";
    return true;
  });

  return (
    <div>
      {leads.length > 0 && (
        <div className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0 scrollbar-hide">
          {(["todos", "novos", "negociando", "frios"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                filtro === f
                  ? "bg-brand-500 text-white"
                  : "bg-ink-900/50 text-mist-400 hover:bg-ink-800 hover:text-mist-200"
              }`}
            >
              {f === "todos" && "Todos"}
              {f === "novos" && "Novos/Quentes"}
              {f === "negociando" && "Em Negociação"}
              {f === "frios" && "Frios/Concluídos"}
            </button>
          ))}
        </div>
      )}

      {leads.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900/50 p-6">
          <p className="text-fluid-sm text-mist-300">
            Nenhum contato ainda. Compartilhe seu link pessoal — todo formulário preenchido a
            partir dele chega aqui com seu nome.
          </p>
          <Link
            href="/corretor/links"
            className="text-fluid-sm mt-3 inline-block font-medium text-brand-200 underline-offset-4 hover:underline"
          >
            Pegar meus links →
          </Link>
        </div>
      ) : leadsFiltrados.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900/50 p-6 text-center">
          <p className="text-fluid-sm text-mist-400">Nenhum lead encontrado neste filtro.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {leadsFiltrados.map((lead) => (
            <CartaoLead key={lead.id} lead={lead} mostrarDono={gestor} />
          ))}
        </div>
      )}
    </div>
  );
}

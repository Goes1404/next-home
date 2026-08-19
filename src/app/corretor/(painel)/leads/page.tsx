import type { Metadata } from "next";
import { ListaLeads } from "./ListaLeads";
import {
  getCorretorLogado,
  getEquipeAtiva,
  getMeusLeads,
  getMeusTemplates,
  souGestor,
} from "@/lib/corretorSessao";

import Link from "next/link";

export const metadata: Metadata = { title: "Meus leads" };

/**
 * A lista cronológica, ao lado do quadro do funil. As duas telas leem os
 * mesmos dados: o funil responde "em que pé está cada negociação", esta aqui
 * responde "o que chegou hoje" — e é onde cabem a mensagem inteira e todos os
 * detalhes, que não caberiam num cartão de coluna.
 */
export default async function LeadsPage() {
  const [leads, gestor, corretor, templates] = await Promise.all([
    getMeusLeads(),
    souGestor(),
    getCorretorLogado(),
    getMeusTemplates(),
  ]);
  const equipe = gestor ? await getEquipeAtiva() : [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-fluid-2xl text-titulo">{gestor ? "Contatos" : "Meus leads"}</h1>
          <p className="text-fluid-sm mt-1 text-apoio max-w-2xl">
            {gestor
              ? "Todos os contatos recebidos pelos formulários do site e portais parceiros."
              : "Contatos que chegaram atribuídos a você — pelo seu link pessoal, portais ou distribuição automática."}
          </p>
        </div>

        <Link
          href="/corretor/importar"
          className="inline-flex items-center gap-2 rounded-full bg-brand-500 hover:bg-brand-400 px-4 py-2 text-sm font-medium text-white shadow-md transition-colors"
        >
          <span>📧</span> Puxar do Gmail / Importar
        </Link>
      </div>

      <ListaLeads
        leads={leads}
        gestor={gestor}
        equipe={equipe}
        templates={templates}
        nomeCorretor={corretor?.nome ?? ""}
        whatsappCorretor={corretor?.whatsapp ?? ""}
      />
    </div>
  );
}

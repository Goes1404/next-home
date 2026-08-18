import type { Metadata } from "next";
import { ListaLeads } from "./ListaLeads";
import {
  getCorretorLogado,
  getEquipeAtiva,
  getMeusLeads,
  getMeusTemplates,
  souGestor,
} from "@/lib/corretorSessao";

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
      <h1 className="text-fluid-2xl text-mist-50">{gestor ? "Contatos" : "Meus leads"}</h1>
      <p className="text-fluid-sm mt-2 text-mist-400">
        {gestor
          ? "Todos os contatos recebidos pelos formulários do site, dos mais recentes aos mais antigos."
          : "Contatos que chegaram atribuídos a você — pelo seu link pessoal ou pela distribuição automática."}
      </p>

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

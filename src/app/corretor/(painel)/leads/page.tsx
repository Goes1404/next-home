import type { Metadata } from "next";
import Link from "next/link";
import { CartaoLead } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { getMeusLeads, souGestor } from "@/lib/corretorSessao";

export const metadata: Metadata = { title: "Meus leads" };

/**
 * A lista cronológica, ao lado do quadro do funil. As duas telas leem os
 * mesmos dados: o funil responde "em que pé está cada negociação", esta aqui
 * responde "o que chegou hoje" — e é onde cabem a mensagem inteira e todos os
 * detalhes, que não caberiam num cartão de coluna.
 */
export default async function LeadsPage() {
  const [leads, gestor] = await Promise.all([getMeusLeads(), souGestor()]);

  return (
    <div>
      <h1 className="text-fluid-2xl text-mist-50">{gestor ? "Contatos" : "Meus leads"}</h1>
      <p className="text-fluid-sm mt-2 text-mist-400">
        {gestor
          ? "Todos os contatos recebidos pelos formulários do site, dos mais recentes aos mais antigos."
          : "Contatos que chegaram atribuídos a você — pelo seu link pessoal ou pela distribuição automática."}
      </p>

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
      ) : (
        <div className="mt-8 space-y-4">
          {leads.map((lead) => (
            <CartaoLead key={lead.id} lead={lead} mostrarDono={gestor} />
          ))}
        </div>
      )}
    </div>
  );
}

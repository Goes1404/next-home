import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeletorDono } from "./SeletorDono";
import { EtiquetaEtapa, dataHora } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { getEquipeAtiva, getLeadsDoFunil, souGestor } from "@/lib/corretorSessao";
import { ETAPAS_FUNIL, ETAPA_LABEL, ORIGEM_ATRIBUICAO_LABEL, type Lead } from "@/lib/types";

export const metadata: Metadata = { title: "Equipe" };

/** Linha do resumo: um corretor e como estão os leads dele. */
type LinhaResumo = {
  id: string;
  nome: string;
  total: number;
  novos: number;
  fechados: number;
  porRoleta: number;
};

function montarResumo(leads: Lead[], equipe: { id: string; nome: string }[]): LinhaResumo[] {
  // Parte da equipe, não dos leads: quem ainda não recebeu nada precisa
  // aparecer com zero. Um corretor invisível na tabela é justamente o que a
  // roleta deveria evitar, e a única forma de notar é vê-lo zerado.
  return equipe
    .map((corretor) => {
      const meus = leads.filter((lead) => lead.corretor?.id === corretor.id);
      return {
        id: corretor.id,
        nome: corretor.nome,
        total: meus.length,
        novos: meus.filter((l) => l.etapa === "novo").length,
        fechados: meus.filter((l) => l.etapa === "fechado").length,
        porRoleta: meus.filter((l) => l.origemAtribuicao === "roleta").length,
      };
    })
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

export default async function EquipePage() {
  // A policy já impede um corretor comum de ler lead alheio; isto impede que
  // ele veja uma tela quebrada e meia-vazia com a promessa de outra coisa.
  if (!(await souGestor())) notFound();

  const [leads, equipe] = await Promise.all([getLeadsDoFunil(), getEquipeAtiva()]);
  const resumo = montarResumo(leads, equipe);
  const semDono = leads.filter((lead) => !lead.corretor);

  const porEtapa = ETAPAS_FUNIL.map((etapa) => ({
    etapa,
    total: leads.filter((lead) => lead.etapa === etapa).length,
  }));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-fluid-2xl text-mist-50">Equipe</h1>
        <p className="text-fluid-sm mt-2 text-mist-400">
          {leads.length} contato{leads.length === 1 ? "" : "s"} no total. A distribuição
          automática entrega o lead a quem recebeu menos nos últimos 30 dias.
        </p>
      </div>

      <section>
        <h2 className="text-fluid-sm font-medium text-mist-100">Onde está cada contato</h2>
        {/* Grade, e não `flex-wrap`: com sete etapas o wrap deixava seis numa
            linha e uma órfã na seguinte, o que se lê como defeito. */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {porEtapa.map(({ etapa, total }) => (
            <div
              key={etapa}
              className="rounded-xl border border-white/10 bg-ink-900/50 px-4 py-3"
            >
              <p className="font-display text-lg text-mist-50">{total}</p>
              <p className="text-fluid-xs text-mist-400">{ETAPA_LABEL[etapa]}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-fluid-sm font-medium text-mist-100">Carga por corretor</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-lg border-collapse text-left">
            <thead>
              <tr className="text-fluid-xs text-mist-500">
                <th className="border-b border-white/10 py-2 pr-4 font-normal">Corretor</th>
                <th className="border-b border-white/10 py-2 pr-4 font-normal">Total</th>
                <th className="border-b border-white/10 py-2 pr-4 font-normal">Novos</th>
                <th className="border-b border-white/10 py-2 pr-4 font-normal">Fechados</th>
                <th className="border-b border-white/10 py-2 font-normal">Pela roleta</th>
              </tr>
            </thead>
            <tbody>
              {resumo.map((linha) => (
                <tr key={linha.id} className="text-fluid-sm text-mist-200">
                  <td className="border-b border-white/5 py-2.5 pr-4">{linha.nome}</td>
                  <td className="border-b border-white/5 py-2.5 pr-4">{linha.total}</td>
                  <td className="border-b border-white/5 py-2.5 pr-4">{linha.novos}</td>
                  <td className="border-b border-white/5 py-2.5 pr-4">{linha.fechados}</td>
                  <td className="border-b border-white/5 py-2.5">{linha.porRoleta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {equipe.length <= 1 && (
          <p className="text-fluid-xs mt-3 text-mist-400">
            Só há um corretor com login ativo, então a roleta entrega tudo a ele. A
            distribuição começa a rodar de verdade quando os outros tiverem conta de acesso.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-fluid-sm font-medium text-mist-100">
          Sem dono {semDono.length > 0 && `(${semDono.length})`}
        </h2>
        <p className="text-fluid-xs mt-1 text-mist-400">
          Contatos que a distribuição automática não conseguiu atribuir — normalmente porque
          chegaram antes de ela existir, ou porque nenhum corretor cobria a região.
        </p>

        {semDono.length === 0 ? (
          <p className="text-fluid-sm mt-3 text-mist-400">Nenhum. Todo lead tem responsável.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {semDono.map((lead) => (
              <li
                key={lead.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-fluid-sm text-mist-50">{lead.nome}</p>
                  <p className="text-fluid-xs text-mist-500">
                    {dataHora.format(new Date(lead.criadoEm))}
                    {lead.empreendimento && ` · ${lead.empreendimento.nome}`}
                  </p>
                </div>
                <SeletorDono leadId={lead.id} donoAtual={null} equipe={equipe} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-fluid-sm font-medium text-mist-100">Todos os contatos</h2>
        <ul className="mt-3 space-y-2">
          {leads.map((lead) => (
            <li
              key={lead.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/50 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-fluid-sm text-mist-50">{lead.nome}</p>
                  <EtiquetaEtapa etapa={lead.etapa} />
                </div>
                <p className="text-fluid-xs mt-0.5 text-mist-500">
                  {dataHora.format(new Date(lead.criadoEm))}
                  {lead.origemAtribuicao &&
                    ` · ${ORIGEM_ATRIBUICAO_LABEL[lead.origemAtribuicao]}`}
                </p>
              </div>
              <SeletorDono
                leadId={lead.id}
                donoAtual={lead.corretor?.id ?? null}
                equipe={equipe}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

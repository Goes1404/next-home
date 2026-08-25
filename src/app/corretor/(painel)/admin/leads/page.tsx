import type { Metadata } from "next";
import Link from "next/link";
import { RedistribuirCarteira } from "./RedistribuirCarteira";
import { SeletorDono } from "./SeletorDono";
import { TogglePausa } from "./TogglePausa";
import { EtiquetaEtapa, dataHora } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { getEquipeAtiva, getPaginaDeLeads } from "@/lib/corretorSessao";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { getAgregadoDaEquipe } from "@/lib/admin/agregados";
import { createClient } from "@/lib/supabase/server";
import { ETAPAS_FUNIL, ETAPA_LABEL, ORIGEM_ATRIBUICAO_LABEL, type Lead } from "@/lib/types";

export const metadata: Metadata = { title: "Leads da equipe" };

/**
 * A tela de distribuição: quem tem quanto, e para quem vai o próximo.
 *
 * Os números vêm de uma consulta magra (`getAgregadoDaEquipe`) e as listas
 * são paginadas (roadmap F5). Antes tudo saía de `getLeadsDoFunil()` e a
 * seção "Todos os contatos" renderizava a carteira inteira — com dez
 * corretores e cem leads cada, mil linhas de uma vez.
 */
export default async function EquipePage() {
  // A policy já impede um corretor comum de ler lead alheio; isto impede que
  // ele veja uma tela quebrada e meia-vazia com a promessa de outra coisa.
  await exigirGestorNaPagina();

  const supabase = await createClient();
  const equipe = await getEquipeAtiva();

  const [agregado, primeiraPagina, { data: orfaos }] = await Promise.all([
    getAgregadoDaEquipe(equipe),
    getPaginaDeLeads(),
    // Sem dono é uma lista curta por natureza (a roleta atribui na chegada);
    // quando não é, o teto evita despejar mil linhas numa seção secundária.
    supabase
      .from("leads")
      .select("id, nome, created_at, empreendimento:empreendimentos(nome)")
      .is("corretor_id", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-fluid-2xl text-titulo font-bold">Administração</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          {agregado.total} contato{agregado.total === 1 ? "" : "s"} no total. A distribuição
          automática entrega o lead a quem recebeu menos nos últimos 30 dias.
        </p>
      </div>

      <AbasAdmin ativa="leads" />

      <RedistribuirCarteira
        equipe={agregado.porCorretor.map((linha) => ({
          id: linha.id,
          nome: linha.nome,
          totalLeads: linha.total,
        }))}
      />

      <section>
        <h2 className="text-fluid-sm text-titulo font-medium">Onde está cada contato</h2>
        {/* Grade, e não `flex-wrap`: o wrap deixava uma etapa órfã na linha
            seguinte, o que se lê como defeito. Seis colunas = seis etapas
            (funil de cinco passos + perdido, migration 0045). */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {ETAPAS_FUNIL.map((etapa) => (
            <Link
              key={etapa}
              href={`/corretor/leads?etapa=${etapa}`}
              className="border-linha bg-superficie hover:border-acento-linha rounded-xl border px-4 py-3 transition-colors"
            >
              <p className="font-display text-titulo text-lg tabular-nums">
                {agregado.porEtapa[etapa] ?? 0}
              </p>
              <p className="text-fluid-xs text-apoio">{ETAPA_LABEL[etapa]}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-fluid-sm text-titulo font-medium">Carga por corretor</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-lg border-collapse text-left">
            <thead>
              <tr className="text-fluid-xs text-tenue">
                <th className="border-linha border-b py-2 pr-4 font-normal">Corretor</th>
                <th className="border-linha border-b py-2 pr-4 font-normal">Escala</th>
                <th className="border-linha border-b py-2 pr-4 font-normal">Total</th>
                {/* A janela de 30 dias é a que a ROLETA usa para decidir o
                    próximo — o total histórico não explica as decisões dela. */}
                <th className="border-linha border-b py-2 pr-4 font-normal">Últimos 30d</th>
                <th className="border-linha border-b py-2 pr-4 font-normal">Novos</th>
                <th className="border-linha border-b py-2 pr-4 font-normal">Fechados</th>
                <th className="border-linha border-b py-2 pr-4 font-normal">Perdidos</th>
                <th className="border-linha border-b py-2 font-normal">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {agregado.porCorretor.map((linha) => (
                <tr key={linha.id} className="text-fluid-sm text-corpo">
                  <td className="border-linha border-b py-2.5 pr-4">
                    {/* O nome leva à lista dele — é a pergunta seguinte a
                        "quem está com mais leads?". */}
                    <Link
                      href={`/corretor/leads?corretor=${linha.id}`}
                      className="hover:text-acento-suave underline-offset-4 hover:underline"
                    >
                      {linha.nome}
                    </Link>
                  </td>
                  <td className="border-linha border-b py-2.5 pr-4">
                    <TogglePausa corretorId={linha.id} emPausa={linha.emPausa} />
                  </td>
                  <td className="border-linha border-b py-2.5 pr-4 tabular-nums">{linha.total}</td>
                  <td className="border-linha border-b py-2.5 pr-4 tabular-nums">
                    {linha.recebidos30d}
                  </td>
                  <td className="border-linha border-b py-2.5 pr-4 tabular-nums">{linha.novos}</td>
                  <td className="border-linha border-b py-2.5 pr-4 tabular-nums">
                    {linha.fechados}
                  </td>
                  <td className="border-linha border-b py-2.5 pr-4 tabular-nums">
                    {linha.perdidos}
                  </td>
                  <td className="border-linha border-b py-2.5 tabular-nums">
                    {/* "—" até o primeiro desfecho: 0% acusaria de não vender
                        quem ainda nem teve chance de fechar. */}
                    {linha.conversao === null ? "—" : `${linha.conversao}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {equipe.length <= 1 && (
          <p className="text-fluid-xs text-apoio mt-3">
            Só há um corretor com login ativo, então a roleta entrega tudo a ele. A distribuição
            começa a rodar de verdade quando os outros tiverem conta de acesso.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-fluid-sm text-titulo font-medium">
          Sem dono {agregado.semDono > 0 && `(${agregado.semDono})`}
        </h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Contatos que a distribuição automática não conseguiu atribuir — normalmente porque
          chegaram antes de ela existir, ou porque nenhum corretor cobria a região.
        </p>

        {agregado.semDono === 0 ? (
          <p className="text-fluid-sm text-apoio mt-3">Nenhum. Todo lead tem responsável.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {(orfaos ?? []).map((lead) => (
                <li
                  key={lead.id}
                  className="border-linha bg-superficie flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-fluid-sm text-titulo">{lead.nome}</p>
                    <p className="text-fluid-xs text-tenue">
                      {dataHora.format(new Date(lead.created_at))}
                    </p>
                  </div>
                  <SeletorDono leadId={lead.id} donoAtual={null} equipe={equipe} />
                </li>
              ))}
            </ul>
            {agregado.semDono > (orfaos?.length ?? 0) && (
              <p className="text-fluid-xs text-tenue mt-2">
                Mostrando os {orfaos?.length ?? 0} mais recentes de {agregado.semDono}.
              </p>
            )}
          </>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-fluid-sm text-titulo font-medium">Contatos recentes</h2>
          <Link
            href="/corretor/leads"
            className="text-fluid-xs text-acento-suave font-medium underline-offset-4 hover:underline"
          >
            Ver todos, com busca e filtro →
          </Link>
        </div>
        <p className="text-fluid-xs text-apoio mt-1">
          Os {primeiraPagina.leads.length} últimos que chegaram, de {primeiraPagina.total}. Para
          achar alguém específico, use a lista completa.
        </p>

        <ul className="mt-3 space-y-2">
          {primeiraPagina.leads.map((lead: Lead) => (
            <li
              key={lead.id}
              className="border-linha bg-superficie flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/corretor/leads/${lead.id}`}
                    className="text-fluid-sm text-titulo hover:text-acento-suave underline-offset-4 hover:underline"
                  >
                    {lead.nome}
                  </Link>
                  <EtiquetaEtapa etapa={lead.etapa} />
                </div>
                <p className="text-fluid-xs text-tenue mt-0.5">
                  {dataHora.format(new Date(lead.criadoEm))}
                  {lead.origemAtribuicao && ` · ${ORIGEM_ATRIBUICAO_LABEL[lead.origemAtribuicao]}`}
                </p>
              </div>
              <SeletorDono leadId={lead.id} donoAtual={lead.corretor?.id ?? null} equipe={equipe} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { CampoVisita } from "@/app/corretor/(painel)/_componentes/CampoVisita";
import { dataHora, diasParado, linkWhatsappLead } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { REGUA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { createClient } from "@/lib/supabase/server";
import {
  getLeadDetalhado,
  getTarefasDoLead,
  getTimelineDoLead,
} from "@/lib/crm/dadosLead";
import { ORIGEM_ATRIBUICAO_LABEL } from "@/lib/types";
import { LinhaDoTempo } from "./LinhaDoTempo";
import { ProximasAcoes } from "./ProximasAcoes";
import { Qualificacao } from "./Qualificacao";
import { SeletorEtapa } from "./SeletorEtapa";

export const metadata: Metadata = { title: "Lead" };

/**
 * A ficha do lead — a tela que faltava.
 *
 * Antes, um lead só existia como linha de tabela ou cartão de coluna: dava
 * para movê-lo de etapa, mas não para saber o que já foi conversado, o que
 * ele procura, nem o que ficou combinado. As três coisas moram aqui.
 *
 * Quem recorta o acesso é a RLS: `getLeadDetalhado` devolve `null` para um
 * lead que não é do corretor logado (ou de qualquer um, se for gestor), e a
 * página vira 404 — sem `if` de papel espalhado pelo componente.
 */
export default async function FichaLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await getLeadDetalhado(id);
  if (!lead) notFound();

  const supabase = await createClient();
  const [tarefas, timeline, { data: empreendimentos }] = await Promise.all([
    getTarefasDoLead(id),
    getTimelineDoLead(id),
    supabase.from("empreendimentos").select("id, nome").order("nome"),
  ]);

  const whatsapp = linkWhatsappLead(lead);
  const parado = diasParado(lead);

  return (
    // O respiro extra no rodapé (mobile) é o espaço da barra de ações fixa.
    <div className="space-y-4 pb-24 md:pb-0">
      <Link
        href="/corretor/leads"
        className="text-fluid-sm inline-flex items-center gap-1.5 text-apoio transition-colors hover:text-titulo"
      >
        <ArrowLeft className="h-4 w-4" /> Meus leads
      </Link>

      {/* Cabeçalho: quem é, em que pé está e como falar com ele. A régua de
          cor na borda esquerda é a mesma da lista e do quadro — abrir a ficha
          não muda o vocabulário visual. */}
      <header className="relative overflow-hidden rounded-2xl border border-linha bg-elevado p-4 pl-5 sm:p-5 sm:pl-6">
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-1.5 ${REGUA_ETAPA[lead.etapa]}`}
        />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-fluid-xl text-titulo">{lead.nome}</h1>
            <p className="text-fluid-xs mt-1 text-tenue">
              Chegou em {dataHora.format(new Date(lead.criadoEm))}
              {lead.corretor && ` · ${lead.corretor.nome}`}
              {lead.origemAtribuicao &&
                ` · ${ORIGEM_ATRIBUICAO_LABEL[lead.origemAtribuicao]}`}
              {parado !== null && ` · parado há ${parado} ${parado === 1 ? "dia" : "dias"}`}
            </p>
          </div>
          <SeletorEtapa leadId={lead.id} etapa={lead.etapa} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fluid-sm inline-flex items-center gap-2 rounded-full bg-[#25D366]/15 px-4 py-2 font-medium text-[#25D366] transition-colors hover:bg-[#25D366] hover:text-white"
            >
              WhatsApp
            </a>
          )}
          {lead.telefone && (
            <a
              href={`tel:${lead.telefone}`}
              className="text-fluid-sm inline-flex items-center gap-2 rounded-full border border-acento-linha bg-acento-lavado px-4 py-2 font-medium text-acento-suave transition-opacity hover:opacity-85"
            >
              <Phone className="h-4 w-4" /> {lead.telefone}
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="text-fluid-sm inline-flex max-w-full items-center gap-2 truncate rounded-full border border-linha bg-vidro px-4 py-2 text-corpo transition-colors hover:border-linha-forte"
            >
              <Mail className="h-4 w-4 shrink-0" />
              <span className="truncate">{lead.email}</span>
            </a>
          )}
        </div>

        {lead.etapa === "visita_agendada" && (
          <CampoVisita leadId={lead.id} quando={lead.visitaAgendadaEm} />
        )}

        {lead.mensagem && (
          <blockquote className="text-fluid-sm mt-4 rounded-xl border-l-2 border-acento-linha bg-vidro px-4 py-3 whitespace-pre-wrap text-corpo">
            {lead.mensagem}
          </blockquote>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Qualificacao
            leadId={lead.id}
            inicial={{
              orcamentoMin: lead.orcamentoMin,
              rendaMensal: lead.rendaMensal,
              orcamentoMax: lead.orcamentoMax,
              dormitoriosMin: lead.dormitoriosMin,
              regiaoInteresse: lead.regiaoInteresse,
              empreendimentoId: lead.empreendimentoId,
            }}
            empreendimentos={empreendimentos ?? []}
          />
          <div id="proximas-acoes" className="scroll-mt-24">
            <ProximasAcoes leadId={lead.id} tarefas={tarefas} />
          </div>
        </div>

        <LinhaDoTempo leadId={lead.id} itens={timeline} />
      </div>

      {/* Barra de ações no polegar (roadmap F2): no celular, as três ações
          que resolvem 90% das visitas à ficha ficam fixas no rodapé — chamar,
          ligar e agendar a próxima tarefa. No desktop o cabeçalho já basta. */}
      <div className="acima-da-nav border-linha bg-fundo/95 fixed inset-x-0 z-45 border-t p-3 backdrop-blur-md md:hidden">
        <div className="mx-auto flex w-full max-w-[84rem] items-center gap-2 px-1">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fluid-sm flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] font-medium text-white transition-opacity hover:opacity-90"
            >
              WhatsApp
            </a>
          )}
          {lead.telefone && (
            <a
              href={`tel:${lead.telefone}`}
              aria-label={`Ligar para ${lead.nome}`}
              className="border-linha-forte text-corpo flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors hover:border-acento-linha"
            >
              <Phone className="h-5 w-5" />
            </a>
          )}
          <a
            href="#proximas-acoes"
            className={`text-fluid-sm border-acento-linha bg-acento-lavado text-acento-suave flex min-h-12 items-center justify-center rounded-xl border px-4 font-medium transition-opacity hover:opacity-85 ${
              whatsapp ? "shrink-0" : "flex-1"
            }`}
          >
            Tarefa
          </a>
        </div>
      </div>
    </div>
  );
}

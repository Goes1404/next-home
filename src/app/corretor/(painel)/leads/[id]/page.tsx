import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { CampoVisita } from "@/app/corretor/(painel)/_componentes/CampoVisita";
import { dataHora, diasParado, linkWhatsappLead } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { REGUA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { BotaoAvancar } from "@/app/corretor/(painel)/_componentes/BotaoAvancar";
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
import { ArquivarLead } from "./ArquivarLead";
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
        href="/corretor/pessoas"
        /* Rótulo e destino batem: dizia "Meus leads" e levava para Pessoas.
           Link que promete um lugar e leva a outro é o começo do labirinto. */
        className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center gap-1.5 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Pessoas
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

        {/* Quantas vezes já tentamos falar com ele (0060).
            Só aparece quando houve alguma: contador que vive em zero ensina
            a ignorar o contador — mesma régua do selo de aba e do cartão de
            pendência do Início.

            O número em destaque é o SEM RESPOSTA, não o total: um lead com
            seis tentativas que respondeu todas é o melhor da carteira, e um
            com três sem nenhuma resposta é o que precisa sair da fila. O
            mesmo número significaria coisas opostas. */}
        {lead.tentativasContato > 0 && (
          <p
            className={`text-fluid-xs mt-2 ${
              lead.tentativasSemResposta >= 3 ? "text-alerta" : "text-tenue"
            }`}
          >
            {lead.tentativasContato}{" "}
            {lead.tentativasContato === 1 ? "tentativa de contato" : "tentativas de contato"}
            {lead.ultimaTentativaEm &&
              ` · última em ${dataHora.format(new Date(lead.ultimaTentativaEm))}`}
            {lead.tentativasSemResposta > 0 &&
              ` · ${lead.tentativasSemResposta} sem resposta`}
            {lead.tentativasSemResposta >= 3 && " — talvez seja hora de parar"}
          </p>
        )}

        {/*
          Do que ele está falando (0083).
          Fica ACIMA do funil de propósito: é a primeira coisa que o
          corretor precisa saber para retomar o atendimento, e até agora
          não existia em lugar nenhum — 64 dos 112 leads ativos tinham
          conversa de WhatsApp e nenhum imóvel vinculado.
        */}
        {lead.imovelInteresse && (
          <p className="text-fluid-sm text-corpo mt-4">
            Conversando sobre{" "}
            <Link
              href={`/empreendimentos/${lead.imovelInteresse.slug}`}
              target="_blank"
              className="text-titulo font-medium underline underline-offset-2"
            >
              {lead.imovelInteresse.nome}
            </Link>
            {lead.empreendimento && lead.empreendimento.slug !== lead.imovelInteresse.slug && (
              <span className="text-tenue"> · chegou pelo {lead.empreendimento.nome}</span>
            )}
          </p>
        )}

        {/*
          O único botão para andar no funil.
          `PassosDoFunil` saiu daqui: a etapa já era dita QUATRO vezes no
          mesmo cabeçalho — a régua de cor na borda, o seletor no canto
          direito, a barra de passos e o próprio rótulo do botão ("Falei com
          ele" nomeia a etapa de destino). Num cabeçalho que empilha até onze
          faixas no celular, a quarta repetição custa uma faixa e não
          acrescenta nada.
        */}
        <BotaoAvancar leadId={lead.id} etapa={lead.etapa} className="mt-4" />

        <div className="mt-4 flex flex-wrap gap-2">
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              /* Verde do WhatsApp, que é marca de terceiro e não token nosso — mas o
                 texto do hover sai de `sobre-cor`: `text-white` sobre esse verde
                 tem 1,9:1 e some. */
              className="text-fluid-sm hover:text-sobre-cor inline-flex min-h-11 items-center gap-2 rounded-full bg-[#25D366]/15 px-4 font-medium text-[#25D366] transition-colors hover:bg-[#25D366]"
            >
              WhatsApp
            </a>
          )}
          {lead.telefone && (
            <a
              href={`tel:${lead.telefone}`}
              className="text-fluid-sm border-acento-linha bg-acento-lavado text-acento-suave inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-medium transition-opacity hover:opacity-85"
            >
              <Phone className="h-4 w-4" /> {lead.telefone}
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="text-fluid-sm border-linha bg-vidro text-corpo hover:border-linha-forte inline-flex min-h-11 max-w-full items-center gap-2 truncate rounded-full border px-4 transition-colors"
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

      <ArquivarLead leadId={lead.id} arquivado={Boolean(lead.arquivadoEm)} nome={lead.nome} />

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

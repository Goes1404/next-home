"use client";

import { useState } from "react";
import Link from "next/link";
import { CampoVisita } from "@/app/corretor/(painel)/_componentes/CampoVisita";
import {
  BadgePortal,
  dataDoCartao,
  dataHora,
  EtiquetaEtapa,
  linkWhatsappLead,
} from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { FolhaAcoesLead } from "@/app/corretor/(painel)/_componentes/FolhaAcoesLead";
import { REGUA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { BotaoAvancar } from "@/app/corretor/(painel)/_componentes/BotaoAvancar";
import type { Lead } from "@/lib/types";
import { ArrowRight, ChevronDown, Mail, Phone } from "lucide-react";

/**
 * A lista de leads em formato de tabela — pensada para carteiras de 50+.
 *
 * O cartão antigo gastava ~400px de altura POR lead com todos os detalhes
 * abertos; cinquenta leads viravam um pergaminho. Aqui cada lead é uma
 * linha compacta e os detalhes (mensagem, interesse, visita, contatos)
 * abrem sob demanda, um lead por vez.
 *
 * Mobile-first de verdade: são duas apresentações do MESMO dado.
 * - No telefone (< md): lista vertical densa — nome, etapa e data numa
 *   linha de ~60px; o toque expande os detalhes e ações.
 * - No desktop (md+): tabela real com colunas, e a mesma expansão por
 *   linha via `<tr>` extra com colSpan.
 *
 * A seleção em massa continua com o pai (ListaLeads): esta tabela só
 * desenha os checkboxes e repassa os eventos — o fluxo de "Enviar
 * mensagem" em massa não muda.
 */

const ROTULO_DETALHE: Record<string, string> = {
  imovelTipo: "Tipo",
  imovelCidade: "Cidade",
  imovelBairro: "Bairro",
  intencao: "Intenção",
};

function IconeWhatsapp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

/** Ações de contato — os mesmos três atalhos do cartão antigo, em 36px. */
function AcoesContato({ lead, aoVivo = false }: { lead: Lead; aoVivo?: boolean }) {
  const whatsapp = linkWhatsappLead(lead);
  const parar = aoVivo ? (e: React.MouseEvent) => e.stopPropagation() : undefined;

  return (
    <div className="flex items-center gap-1.5">
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          onClick={parar}
          title="Chamar no WhatsApp"
          aria-label={`WhatsApp de ${lead.nome}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366] transition-colors hover:bg-[#25D366] hover:text-white"
        >
          <IconeWhatsapp className="h-4.5 w-4.5" />
        </a>
      )}
      {lead.telefone && (
        <a
          href={`tel:${lead.telefone}`}
          onClick={parar}
          title="Ligar"
          aria-label={`Ligar para ${lead.nome}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-acento-linha bg-acento-lavado text-acento-suave transition-colors hover:opacity-85"
        >
          <Phone className="h-4 w-4" />
        </a>
      )}
      {lead.email && (
        <a
          href={`mailto:${lead.email}`}
          onClick={parar}
          title="E-mail"
          aria-label={`E-mail para ${lead.nome}`}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-linha bg-elevado text-corpo transition-colors hover:border-linha-forte hover:bg-vidro-forte"
        >
          <Mail className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

/** O conteúdo expandido — idêntico nas duas apresentações. */
function DetalhesLead({ lead, gestor }: { lead: Lead; gestor: boolean }) {
  const ehProprietario = lead.tipo === "proprietario";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <BadgePortal portal={lead.portalOrigem} origem={lead.origem} />
        <span
          className={
            ehProprietario
              ? "text-fluid-xs rounded-full border border-etapa-areia-linha bg-etapa-areia-lavado px-2.5 py-1 font-medium text-etapa-areia"
              : "text-fluid-xs rounded-full bg-acento-lavado px-2.5 py-1 font-medium text-acento-suave"
          }
        >
          {ehProprietario ? "Tem imóvel" : "Quer comprar"}
        </span>
        <span className="text-fluid-xs text-tenue">{dataHora.format(new Date(lead.criadoEm))}</span>
      </div>

      <dl className="text-fluid-sm grid gap-x-6 gap-y-1 text-corpo sm:grid-cols-2">
        {gestor && (
          <div>
            <dt className="inline text-tenue">Corretor </dt>
            <dd className="inline">{lead.corretor?.nome ?? "Sem dono"}</dd>
          </div>
        )}
        {lead.telefone && (
          <div>
            <dt className="inline text-tenue">Telefone </dt>
            <dd className="inline">{lead.telefone}</dd>
          </div>
        )}
        {lead.email && (
          <div>
            <dt className="inline text-tenue">E-mail </dt>
            <dd className="inline break-all">{lead.email}</dd>
          </div>
        )}
        {lead.empreendimento && (
          <div>
            <dt className="inline text-tenue">Interesse </dt>
            <dd className="inline">
              <Link
                href={`/empreendimentos/${lead.empreendimento.slug}`}
                className="text-acento-suave underline-offset-4 hover:underline"
              >
                {lead.empreendimento.nome}
              </Link>
            </dd>
          </div>
        )}
        {lead.detalhes &&
          Object.entries(lead.detalhes).map(([chave, valor]) => (
            <div key={chave}>
              <dt className="inline text-tenue">{ROTULO_DETALHE[chave] ?? chave} </dt>
              <dd className="inline">{valor}</dd>
            </div>
          ))}
      </dl>

      {lead.etapa === "visita_agendada" && <CampoVisita leadId={lead.id} quando={lead.visitaAgendadaEm} />}

      {lead.mensagem && (
        <p className="text-fluid-sm rounded-xl border border-linha bg-elevado px-4 py-3 whitespace-pre-line text-corpo">
          {lead.mensagem}
        </p>
      )}

      {/* A porta para a ficha: histórico, qualificação e próximas ações. */}
      <Link
        href={`/corretor/leads/${lead.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-fluid-sm inline-flex items-center gap-1.5 rounded-full border border-acento-linha bg-acento-lavado px-4 py-2 font-medium text-acento-suave transition-opacity hover:opacity-85"
      >
        Abrir ficha <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function TabelaLeads({
  leads,
  gestor,
  selecionados,
  aoAlternarSelecao,
}: {
  leads: Lead[];
  gestor: boolean;
  selecionados: Set<string>;
  aoAlternarSelecao: (id: string) => void;
}) {
  // Um lead aberto por vez: abrir outro fecha o anterior. Com 50 linhas,
  // vários abertos ao mesmo tempo recriariam o pergaminho que esta tabela
  // veio substituir.
  const [abertoId, setAbertoId] = useState<string | null>(null);
  // Lead com a folha de ações aberta (celular): WhatsApp/ligar/ficha/etapa.
  const [leadFolha, setLeadFolha] = useState<Lead | null>(null);

  const alternar = (id: string) => setAbertoId((atual) => (atual === id ? null : id));

  return (
    <div className="overflow-hidden rounded-2xl border border-linha bg-superficie">
      {/* ---------------------------------------------------------------
          Telefone: lista densa. O nome expande os detalhes; a ação primária
          (WhatsApp) fica sempre à mostra e o "⋯" abre a folha de ações —
          mover de etapa em dois toques, sem procurar nada (roadmap F2).
          --------------------------------------------------------------- */}
      <ul className="divide-y divide-linha md:hidden">
        {leads.map((lead) => {
          const aberto = abertoId === lead.id;
          const whatsapp = linkWhatsappLead(lead);
          return (
            <li key={lead.id}>
              <div
                className={`flex items-center gap-2.5 py-3 pr-3 pl-0 ${aberto ? "bg-elevado/60" : ""}`}
              >
                {/* A régua de cor: a etapa se lê antes de qualquer texto, e
                    rolando a lista dá para ver a distribuição do funil sem
                    ler uma palavra. Mesma escala do quadro e do termômetro. */}
                <span
                  aria-hidden
                  className={`h-11 w-1 shrink-0 rounded-r-full ${REGUA_ETAPA[lead.etapa]}`}
                />
                <input
                  type="checkbox"
                  checked={selecionados.has(lead.id)}
                  onChange={() => aoAlternarSelecao(lead.id)}
                  aria-label={`Selecionar ${lead.nome}`}
                  className="accent-acento h-4.5 w-4.5 shrink-0 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => alternar(lead.id)}
                  aria-expanded={aberto}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-fluid-sm block truncate font-medium text-titulo">
                      {lead.nome}
                    </span>
                    <span className="text-fluid-xs mt-0.5 flex items-center gap-1.5 text-tenue">
                      <EtiquetaEtapa etapa={lead.etapa} />
                      <span className="truncate">{dataDoCartao(lead)}</span>
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-tenue transition-transform ${aberto ? "rotate-180" : ""}`}
                  />
                </button>

                {whatsapp && (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Chamar no WhatsApp"
                    aria-label={`WhatsApp de ${lead.nome}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366] transition-colors hover:bg-[#25D366] hover:text-white"
                  >
                    <IconeWhatsapp className="h-5 w-5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setLeadFolha(lead)}
                  aria-label={`Mais ações para ${lead.nome}`}
                  className="border-linha text-apoio flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors hover:border-linha-forte hover:text-titulo"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
                    <circle cx="5" cy="12" r="1.7" />
                    <circle cx="12" cy="12" r="1.7" />
                    <circle cx="19" cy="12" r="1.7" />
                  </svg>
                </button>
              </div>

              {/* O botão de um toque, embaixo da linha: mover o lead é a
                  ação mais repetida do dia e não pode depender de abrir
                  nada. Ocupa a largura toda porque é o alvo do polegar. */}
              <div className="px-3 pb-3 pl-4">
                <BotaoAvancar
                  leadId={lead.id}
                  etapa={lead.etapa}
                  tamanho="compacto"
                  className="w-full"
                />
              </div>

              {aberto && (
                <div className="space-y-3 border-t border-linha bg-elevado/40 px-4 py-4">
                  <DetalhesLead lead={lead} gestor={gestor} />
                  <AcoesContato lead={lead} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {leadFolha && <FolhaAcoesLead lead={leadFolha} onFechar={() => setLeadFolha(null)} />}

      {/* ---------------------------------------------------------------
          Desktop (md+): tabela de verdade. A linha inteira expande; as
          ações têm stopPropagation para não abrirem a linha junto.
          --------------------------------------------------------------- */}
      <table className="hidden w-full border-collapse md:table">
        <thead>
          <tr className="border-b border-linha-forte bg-elevado/50 text-left">
            <th className="w-1 p-0" aria-hidden />
            <th className="w-10 px-3 py-3" aria-label="Seleção" />
            <th className="text-fluid-xs px-3 py-3 font-semibold tracking-wide text-apoio uppercase">
              Lead
            </th>
            <th className="text-fluid-xs px-3 py-3 font-semibold tracking-wide text-apoio uppercase">
              Contato
            </th>
            {gestor && (
              <th className="text-fluid-xs px-3 py-3 font-semibold tracking-wide text-apoio uppercase">
                Corretor
              </th>
            )}
            <th className="text-fluid-xs px-3 py-3 font-semibold tracking-wide text-apoio uppercase">
              Etapa
            </th>
            <th className="text-fluid-xs px-3 py-3 font-semibold tracking-wide text-apoio uppercase">
              Chegou
            </th>
            <th className="text-fluid-xs px-3 py-3 text-right font-semibold tracking-wide text-apoio uppercase">
              Ações
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-linha">
          {leads.map((lead) => {
            const aberto = abertoId === lead.id;
            return (
              <FragmentoLinha
                key={lead.id}
                lead={lead}
                gestor={gestor}
                aberto={aberto}
                selecionado={selecionados.has(lead.id)}
                aoAlternarSelecao={() => aoAlternarSelecao(lead.id)}
                aoAlternarAberto={() => alternar(lead.id)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentoLinha({
  lead,
  gestor,
  aberto,
  selecionado,
  aoAlternarSelecao,
  aoAlternarAberto,
}: {
  lead: Lead;
  gestor: boolean;
  aberto: boolean;
  selecionado: boolean;
  aoAlternarSelecao: () => void;
  aoAlternarAberto: () => void;
}) {
  // A régua de cor soma uma coluna; o gestor soma a de "Corretor". O colSpan
  // da linha expandida acompanha as duas.
  const totalColunas = gestor ? 8 : 7;

  return (
    <>
      <tr
        onClick={aoAlternarAberto}
        aria-expanded={aberto}
        className={`cursor-pointer transition-colors ${aberto ? "bg-elevado/60" : "hover:bg-elevado/40"}`}
      >
        {/* A mesma régua da lista do celular, agora como borda esquerda da
            linha: uma escala de cor só para as duas apresentações. */}
        <td className={`w-1 p-0 ${REGUA_ETAPA[lead.etapa]}`} aria-hidden />
        <td className="px-3 py-2.5">
          <input
            type="checkbox"
            checked={selecionado}
            onChange={aoAlternarSelecao}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Selecionar ${lead.nome}`}
            className="accent-acento h-4.5 w-4.5 cursor-pointer"
          />
        </td>
        <td className="max-w-[16rem] px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Link
              href={`/corretor/leads/${lead.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-fluid-sm truncate font-medium text-titulo underline-offset-4 hover:text-acento-suave hover:underline"
            >
              {lead.nome}
            </Link>
            <BadgePortal portal={lead.portalOrigem} origem={lead.origem} />
          </div>
        </td>
        <td className="text-fluid-sm max-w-[13rem] px-3 py-2.5 text-corpo">
          <span className="block truncate">{lead.telefone ?? lead.email ?? "—"}</span>
        </td>
        {gestor && (
          <td className="text-fluid-sm max-w-[10rem] px-3 py-2.5 text-corpo">
            <span className="block truncate">{lead.corretor?.nome ?? "Sem dono"}</span>
          </td>
        )}
        <td className="px-3 py-2.5">
          <EtiquetaEtapa etapa={lead.etapa} />
        </td>
        <td className="text-fluid-sm px-3 py-2.5 whitespace-nowrap text-apoio">
          {dataDoCartao(lead)}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center justify-end gap-1.5">
            <AcoesContato lead={lead} aoVivo />
            <ChevronDown
              className={`h-4 w-4 text-tenue transition-transform ${aberto ? "rotate-180" : ""}`}
            />
          </div>
        </td>
      </tr>
      {aberto && (
        <tr className="bg-elevado/40">
          <td colSpan={totalColunas} className="px-5 py-4">
            <DetalhesLead lead={lead} gestor={gestor} />
          </td>
        </tr>
      )}
    </>
  );
}

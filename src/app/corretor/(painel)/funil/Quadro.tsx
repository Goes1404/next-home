"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { moverEtapa } from "@/app/corretor/actions";
import { CampoVisita } from "@/app/corretor/(painel)/_componentes/CampoVisita";
import {
  BadgePortal,
  dataDoCartao,
  diasParado,
  linkWhatsappLead,
} from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { BORDA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { ModalDossieLead } from "./ModalDossieLead";
import { ETAPAS_FUNIL, ETAPA_LABEL, type EtapaFunil, type Lead } from "@/lib/types";

/**
 * Quadro do funil.
 *
 * Sem biblioteca de drag-and-drop de propósito. O gesto principal é o seletor
 * "Mover para" em cada cartão: funciona no celular — que é onde o corretor
 * está quando lembra de mover um lead —, é operável por teclado sem nenhum
 * código extra, e não custa 40 kB de JavaScript. Arrastar com o mouse existe
 * por cima disso, com a API nativa do HTML5 (que não funciona em toque, daí a
 * ordem de prioridade ser essa e não a inversa).
 */


export function Quadro({ leads, mostrarDono }: { leads: Lead[]; mostrarDono: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [leadDossie, setLeadDossie] = useState<Lead | null>(null);
  const [, iniciarTransicao] = useTransition();

  // O cartão pula de coluna antes de o servidor responder. Se a resposta vier
  // com erro, o React descarta este estado sozinho ao fim da transição e o
  // cartão volta para onde estava — por isso a action precisa devolver erro
  // de verdade quando o RLS nega (ver `moverEtapa`).
  const [otimista, aplicarMovimento] = useOptimistic(
    leads,
    (estado: Lead[], movimento: { id: string; etapa: EtapaFunil }) =>
      estado.map((lead) =>
        lead.id === movimento.id ? { ...lead, etapa: movimento.etapa } : lead,
      ),
  );

  function mover(lead: Lead, etapa: EtapaFunil) {
    if (lead.etapa === etapa) return;
    setErro(null);
    iniciarTransicao(async () => {
      aplicarMovimento({ id: lead.id, etapa });
      const resultado = await moverEtapa(lead.id, etapa);
      if (resultado.erro) setErro(resultado.erro);
    });
  }

  function soltarEm(etapa: EtapaFunil, idArrastado: string) {
    const lead = otimista.find((l) => l.id === idArrastado);
    if (lead) mover(lead, etapa);
  }

  if (leads.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-linha bg-superficie p-6">
        <p className="text-fluid-sm text-corpo">
          Nenhum contato no funil ainda. Assim que alguém preencher um formulário do site, o
          card aparece aqui na coluna “Novo lead”.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {erro && (
        <p
          role="alert"
          className="text-fluid-sm mb-4 rounded-xl border border-etapa-areia-linha bg-etapa-areia-lavado px-4 py-3 text-etapa-areia"
        >
          {erro}
        </p>
      )}

      {/* Rola na horizontal como a barra de abas; as colunas têm largura fixa
          para o cartão não achatar quando uma etapa esvazia. */}
      <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
        {ETAPAS_FUNIL.map((etapa) => {
          const daEtapa = otimista.filter((lead) => lead.etapa === etapa);
          return (
            <section
              key={etapa}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                soltarEm(etapa, e.dataTransfer.getData("text/plain"));
                setArrastando(null);
              }}
              className={`w-72 shrink-0 rounded-2xl border bg-superficie p-3 ${BORDA_ETAPA[etapa]} ${
                arrastando ? "border-dashed" : ""
              }`}
            >
              <header className="flex items-baseline justify-between px-1 pb-3">
                <h2 className="text-fluid-sm font-medium text-titulo">
                  {ETAPA_LABEL[etapa]}
                </h2>
                <span className="text-fluid-xs text-tenue">{daEtapa.length}</span>
              </header>

              <div className="space-y-2">
                {daEtapa.map((lead) => (
                  <Cartao
                    key={lead.id}
                    lead={lead}
                    mostrarDono={mostrarDono}
                    onMover={(destino) => mover(lead, destino)}
                    onArrastar={() => setArrastando(lead.id)}
                    onSoltar={() => setArrastando(null)}
                    onVerDossie={() => setLeadDossie(lead)}
                  />
                ))}

                {daEtapa.length === 0 && (
                  <p className="text-fluid-xs px-1 py-6 text-center text-tenue">
                    Vazio
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Modal de Dossiê Executivo da IA */}
      {leadDossie && (
        <ModalDossieLead lead={leadDossie} onFechar={() => setLeadDossie(null)} />
      )}
    </div>
  );
}

function Cartao({
  lead,
  mostrarDono,
  onMover,
  onArrastar,
  onSoltar,
  onVerDossie,
}: {
  lead: Lead;
  mostrarDono: boolean;
  onMover: (etapa: EtapaFunil) => void;
  onArrastar: () => void;
  onSoltar: () => void;
  onVerDossie: () => void;
}) {
  const whatsapp = linkWhatsappLead(lead);
  const parado = diasParado(lead);

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", lead.id);
        e.dataTransfer.effectAllowed = "move";
        onArrastar();
      }}
      onDragEnd={onSoltar}
      className="rounded-xl border border-linha bg-superficie p-3 relative group"
    >
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <Link
          href={`/corretor/leads/${lead.id}`}
          draggable={false}
          className="text-fluid-sm font-medium text-titulo underline-offset-4 hover:text-acento-suave hover:underline"
        >
          {lead.nome}
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onVerDossie}
            title="Ver Dossiê de Inteligência do Lead"
            className="bg-acento-lavado text-acento-suave border-acento-linha hover:bg-acento flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
            >
              <path d="M12 3v2M8 5h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
              <path d="M9.5 10v1.5M14.5 10v1.5M9.5 14.5h5M4 10v3M20 10v3" />
            </svg>
            Dossiê IA
          </button>
          <BadgePortal portal={lead.portalOrigem} origem={lead.origem} />
        </div>
      </div>

      <p className="text-fluid-xs mt-1 text-tenue">
        {dataDoCartao(lead)}
        {lead.tipo === "proprietario" && " · tem imóvel"}
        {/* Só a partir de 3 dias: antes disso "parado" é só o fim de semana. */}
        {parado !== null && parado >= 3 && (
          <span className="text-etapa-areia"> · parado há {parado} dias</span>
        )}
      </p>

      {mostrarDono && (
        <p className="text-fluid-xs mt-1 text-apoio">{lead.corretor?.nome ?? "Sem dono"}</p>
      )}

      {lead.empreendimento && (
        <p className="text-fluid-xs mt-1 truncate text-apoio">{lead.empreendimento.nome}</p>
      )}

      {lead.etapa === "visita_agendada" && (
        <CampoVisita leadId={lead.id} quando={lead.visitaAgendadaEm} />
      )}

      <div className="mt-3 flex items-center gap-2">
        <label className="sr-only" htmlFor={`mover-${lead.id}`}>
          Mover {lead.nome} para outra etapa
        </label>
        <select
          id={`mover-${lead.id}`}
          value={lead.etapa}
          onChange={(e) => onMover(e.target.value as EtapaFunil)}
          className="text-fluid-xs bg-campo border-linha-forte text-corpo min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg border px-2"
        >
          {ETAPAS_FUNIL.map((etapa) => (
            <option key={etapa} value={etapa}>
              {ETAPA_LABEL[etapa]}
            </option>
          ))}
        </select>

        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Falar com ${lead.nome} no WhatsApp`}
            title={`Falar com ${lead.nome} no WhatsApp`}
            className="bg-acento hover:bg-acento-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
              <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.25 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.55-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
            </svg>
          </a>
        )}
      </div>
    </article>
  );
}

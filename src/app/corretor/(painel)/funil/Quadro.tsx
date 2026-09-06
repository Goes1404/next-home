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
import { BORDA_ETAPA, REGUA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { BotaoAvancar } from "@/app/corretor/(painel)/_componentes/BotaoAvancar";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { ModalDossieLead } from "./ModalDossieLead";
import { ETAPAS_FUNIL, ETAPA_LABEL, type EtapaFunil, type Lead } from "@/lib/types";

/**
 * O funil — uma LISTA agrupada por etapa, não um quadro de colunas.
 *
 * Era um kanban de seis colunas com rolagem lateral e arrastar do HTML5. Três
 * coisas o derrubaram, e as três são medidas:
 *
 * 1. A distribuição real (02/09/2026): perdido 62, primeiro contato 46, novo
 *    6, fechado 1, visita 1, documentação 0. Duas colunas guardavam 108 dos
 *    116 leads e quatro estavam praticamente vazias — muito espaço para
 *    pouca informação.
 * 2. Rolagem lateral sem aviso nenhum: em 360px as últimas colunas
 *    simplesmente não existiam para quem não adivinhasse o gesto.
 * 3. Arrastar do HTML5 NÃO FUNCIONA EM TOQUE, e o painel é usado no celular.
 *    O gesto principal sempre foi o botão de avançar e o seletor "Mover
 *    para"; o arrastar era enfeite que só o mouse alcançava.
 *
 * Agora: as etapas empilhadas na ordem do funil, cada uma com os cartões numa
 * grade que acompanha a largura da tela. Mesma informação, sem rolagem
 * lateral e sem gesto que metade dos aparelhos não tem. Etapa vazia vira uma
 * linha fina — ela precisa continuar aparecendo (o funil é uma sequência, e
 * buraco no meio dele confunde), mas não pode custar uma tela de rolagem.
 *
 * E cada grupo mostra no máximo `POR_ETAPA` cartões. Empilhado, "primeiro
 * contato" com 46 pessoas viraria dez mil pixels de rolagem dentro de um
 * grupo só — no quadro isso ficava escondido porque cada coluna rolava por
 * conta própria. O funil responde "como está distribuída a minha carteira",
 * não "deixa eu folhear 46 pessoas"; para folhear existe a lista, que pagina
 * e filtra, e é para lá que o link do rodapé do grupo aponta.
 */

/** Cartões visíveis por etapa antes de o grupo mandar para a lista. */
const POR_ETAPA = 6;


export function Quadro({
  leads,
  contagens,
  mostrarDono,
}: {
  leads: Lead[];
  /** Total real por etapa, do banco — o quadro pode ter recebido menos (teto). */
  contagens?: Record<EtapaFunil, number>;
  mostrarDono: boolean;
}) {
  const [leadDossie, setLeadDossie] = useState<Lead | null>(null);
  const { falhar } = useAvisos();
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
    iniciarTransicao(async () => {
      aplicarMovimento({ id: lead.id, etapa });
      const resultado = await moverEtapa(lead.id, etapa);
      if (resultado.erro) falhar(resultado.erro);
    });
  }

  if (leads.length === 0) {
    return (
      <div className="cartao mt-8 p-6">
        <p className="text-fluid-sm text-corpo">
          Ninguém no funil ainda. Assim que alguém chegar pelo seu link ou por um
          formulário do site, aparece aqui no grupo “Leads”.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">

      <div className="space-y-4">
        {ETAPAS_FUNIL.map((etapa) => {
          const daEtapa = otimista.filter((lead) => lead.etapa === etapa);
          // A tela recebe no máximo `TETO_DO_QUADRO` leads; a contagem do
          // banco é a verdade. `faltando` soma os dois cortes — o do teto da
          // consulta e o de `POR_ETAPA` — porque para quem lê é a mesma
          // frase: "tem mais gente aqui do que estou mostrando".
          const totalReal = contagens?.[etapa] ?? daEtapa.length;
          const visiveis = daEtapa.slice(0, POR_ETAPA);
          const faltando = Math.max(0, totalReal - visiveis.length);
          const vazia = totalReal === 0;

          return (
            <section
              key={etapa}
              aria-labelledby={`etapa-${etapa}`}
              className={`rounded-2xl border bg-superficie ${BORDA_ETAPA[etapa]} ${vazia ? "px-4 py-2.5" : "p-3"}`}
            >
              <header className="flex items-baseline justify-between gap-3 px-1">
                <h2 id={`etapa-${etapa}`} className="text-fluid-sm text-titulo font-medium">
                  {ETAPA_LABEL[etapa]}
                </h2>
                <span className="text-fluid-xs text-tenue tabular-nums">
                  {vazia ? "ninguém" : totalReal}
                </span>
              </header>

              {!vazia && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {visiveis.map((lead) => (
                    <Cartao
                      key={lead.id}
                      lead={lead}
                      mostrarDono={mostrarDono}
                      onMover={(destino) => mover(lead, destino)}
                      onVerDossie={() => setLeadDossie(lead)}
                    />
                  ))}
                </div>
              )}

              {faltando > 0 && (
                <Link
                  href={`/corretor/leads?etapa=${etapa}`}
                  className="border-linha text-corpo hover:border-acento-linha hover:text-titulo text-fluid-xs mt-2 flex min-h-11 items-center justify-center rounded-xl border transition-colors"
                >
                  Ver os outros {faltando} em {ETAPA_LABEL[etapa].toLowerCase()}
                </Link>
              )}
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
  onVerDossie,
}: {
  lead: Lead;
  mostrarDono: boolean;
  onMover: (etapa: EtapaFunil) => void;
  onVerDossie: () => void;
}) {
  const whatsapp = linkWhatsappLead(lead);
  const parado = diasParado(lead);

  return (
    <article className="border-linha bg-elevado group relative overflow-hidden rounded-xl border p-3 pl-4">
      {/* A régua da etapa, igual à da lista: mesmo gesto, mesma escala. Aqui
          ela é redundante com o grupo, e isso é de propósito — o cartão viaja
          para a lista e para a ficha, e precisa se explicar sozinho. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${REGUA_ETAPA[lead.etapa]}`}
      />
      <div className="flex items-center justify-between gap-1 flex-wrap">
        <Link
          href={`/corretor/leads/${lead.id}`}
          className="text-fluid-sm font-medium text-titulo underline-offset-4 hover:text-acento-suave hover:underline"
        >
          {lead.nome}
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onVerDossie}
            title="Ver Dossiê de Inteligência do Lead"
            className="bg-acento-lavado text-acento-suave border-acento-linha hover:bg-acento flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors hover:text-sobre-cor"
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
          <span className="text-alerta"> · parado há {parado} dias</span>
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

      {/* Um toque para avançar. O seletor de sete opções virou o caminho
          secundário: ele resolve o caso raro (pular etapa, voltar, perder) e
          por isso não precisa mais ser a primeira coisa que o dedo encontra. */}
      <div className="mt-3">
        <BotaoAvancar leadId={lead.id} etapa={lead.etapa} tamanho="compacto" className="w-full" />
      </div>

      <div className="mt-2 flex items-center gap-2">
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
            className="bg-acento hover:bg-acento-hover flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sobre-cor transition-colors"
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

"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
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
 * O funil é um QUADRO de colunas laterais — uma coluna por etapa, lado a
 * lado, em toda largura de tela (decisão do usuário, 09/09/2026).
 *
 * Isto REVERTE a versão empilhada de 02/09/2026, e a reversão é deliberada:
 * as faixas horizontais liam bem no celular mas perdiam o que o kanban é —
 * ver a carteira inteira de relance, com a etapa como EIXO e não como
 * cabeçalho de lista. Os três motivos que derrubaram o quadro antigo
 * continuam válidos como motivos; o que mudou é que os três têm resposta:
 *
 * 1. **Distribuição torta** (perdido 62, primeiro contato 46, novo 6, o resto
 *    quase vazio): coluna VAZIA encolhe (`LARGURA_VAZIA`). Ela precisa
 *    continuar aparecendo — o funil é uma sequência e buraco no meio confunde
 *    — mas não pode custar a mesma largura de uma coluna cheia.
 * 2. **Rolagem lateral que não se anuncia**: a coluna mede 78vw, então a
 *    PRÓXIMA fica sempre espiando na borda. É o gesto se anunciando por
 *    geometria, que é o que faltava na versão antiga (colunas de largura
 *    fixa terminavam exatamente na dobra). Vale a exceção declarada em
 *    `naoRolaDeLado.test.ts`: aqui a rolagem é o CONTEÚDO, não navegação
 *    escondida atrás de um gesto que ninguém adivinha.
 * 3. **Arrastar do HTML5 não funciona em toque**: o arrastar daqui é POINTER
 *    EVENTS (`setPointerCapture` + `elementFromPoint`), o mesmo código para
 *    dedo, caneta e mouse. O alvo do gesto é a alça (⠿) e só ela leva
 *    `touch-none` — o resto do cartão continua rolando a coluna com o dedo.
 *
 * O que NÃO mudou, de propósito: o botão de avançar e o seletor "Mover para"
 * continuam em cada cartão, porque são eles que funcionam no teclado e no
 * leitor de tela. Gesto não pode ser a única porta para mover um lead.
 *
 * Cada coluna rola por conta própria e não tem teto de cartões: "primeiro
 * contato" com 46 pessoas cabe dentro da coluna em vez de empurrar a página
 * — que era justamente o que o empilhamento não sabia fazer. O teto que
 * sobra é o da CONSULTA (`TETO_DO_QUADRO`, 300); quando ele corta, o rodapé
 * da coluna manda para a lista, que pagina e filtra.
 */

/** Coluna com gente: sobra borda para a próxima espiar e anunciar a rolagem. */
const LARGURA_COLUNA = "w-[78vw] max-w-72 sm:w-72";
/** Coluna sem ninguém não merece a mesma largura — ver motivo 1 acima. */
const LARGURA_VAZIA = "w-40";
/** Altura da coluna: o quadro cabe na tela e cada coluna rola por dentro. */
const ALTURA_COLUNA = "max-h-[68svh]";
/** Faixa da borda em que o arrasto empurra o quadro de lado, em px. */
const MARGEM_AUTOSCROLL = 56;

type Arrasto = { id: string; nome: string; origem: EtapaFunil; x: number; y: number };

/**
 * Qual coluna está debaixo do ponteiro. O fantasma é `pointer-events-none`,
 * então ele não se intercepta e `elementFromPoint` enxerga a coluna.
 */
function etapaSob(x: number, y: number): EtapaFunil | null {
  const alvo = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-etapa]");
  const etapa = alvo?.dataset.etapa;
  return etapa && (ETAPAS_FUNIL as readonly string[]).includes(etapa)
    ? (etapa as EtapaFunil)
    : null;
}

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

  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [alvo, setAlvo] = useState<EtapaFunil | null>(null);
  const faixaRef = useRef<HTMLDivElement | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const arrastando = arrasto !== null;

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

  // Arrastar para uma coluna fora da tela seria impossível sem isto: com o
  // dedo parado na borda não chega `pointermove` nenhum, então quem empurra o
  // quadro é um laço de quadro, lendo a última posição conhecida.
  useEffect(() => {
    if (!arrastando) return;
    let quadro = 0;
    const passo = () => {
      const faixa = faixaRef.current;
      if (faixa) {
        const caixa = faixa.getBoundingClientRect();
        const { x } = posRef.current;
        if (x < caixa.left + MARGEM_AUTOSCROLL) faixa.scrollLeft -= 14;
        else if (x > caixa.right - MARGEM_AUTOSCROLL) faixa.scrollLeft += 14;
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [arrastando]);

  function mover(lead: Lead, etapa: EtapaFunil) {
    if (lead.etapa === etapa) return;
    iniciarTransicao(async () => {
      aplicarMovimento({ id: lead.id, etapa });
      const resultado = await moverEtapa(lead.id, etapa);
      if (resultado.erro) falhar(resultado.erro);
    });
  }

  function pegar(evento: React.PointerEvent<HTMLElement>, lead: Lead) {
    // Sem isto o navegador entende o gesto como seleção de texto (mouse) ou
    // como rolagem (toque) e o arrasto morre no primeiro milímetro.
    evento.preventDefault();
    evento.currentTarget.setPointerCapture(evento.pointerId);
    posRef.current = { x: evento.clientX, y: evento.clientY };
    setArrasto({
      id: lead.id,
      nome: lead.nome,
      origem: lead.etapa,
      x: evento.clientX,
      y: evento.clientY,
    });
    setAlvo(lead.etapa);
  }

  function mexer(evento: React.PointerEvent<HTMLElement>) {
    if (!arrasto) return;
    posRef.current = { x: evento.clientX, y: evento.clientY };
    setArrasto((atual) =>
      atual ? { ...atual, x: evento.clientX, y: evento.clientY } : atual,
    );
    setAlvo(etapaSob(evento.clientX, evento.clientY));
  }

  function soltar(evento: React.PointerEvent<HTMLElement>) {
    if (!arrasto) return;
    const destino = etapaSob(evento.clientX, evento.clientY);
    const lead = otimista.find((l) => l.id === arrasto.id);
    // Soltar fora de qualquer coluna é DESISTIR: o cartão volta para onde
    // estava e o banco não é tocado.
    if (lead && destino && destino !== arrasto.origem) mover(lead, destino);
    setArrasto(null);
    setAlvo(null);
  }

  function cancelar() {
    setArrasto(null);
    setAlvo(null);
  }

  if (leads.length === 0) {
    return (
      <div className="cartao mt-8 p-6">
        <p className="text-fluid-sm text-corpo">
          Ninguém no funil ainda. Assim que alguém chegar pelo seu link ou por um
          formulário do site, aparece aqui na coluna “Novo”.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div
        ref={faixaRef}
        className={`flex snap-x gap-3 overflow-x-auto pb-3 ${arrastando ? "select-none" : ""}`}
      >
        {ETAPAS_FUNIL.map((etapa) => {
          const daEtapa = otimista.filter((lead) => lead.etapa === etapa);
          // A tela recebe no máximo `TETO_DO_QUADRO` leads; a contagem do
          // banco é a verdade. `faltando` é o que a consulta cortou — para
          // quem lê é uma frase só: "tem mais gente aqui do que estou
          // mostrando".
          const totalReal = contagens?.[etapa] ?? daEtapa.length;
          const faltando = Math.max(0, totalReal - daEtapa.length);
          const vazia = daEtapa.length === 0;
          const mirada = arrastando && alvo === etapa && arrasto.origem !== etapa;

          return (
            <section
              key={etapa}
              data-etapa={etapa}
              aria-labelledby={`etapa-${etapa}`}
              className={`bg-superficie flex shrink-0 snap-start flex-col rounded-2xl border transition-colors ${ALTURA_COLUNA} ${
                vazia ? LARGURA_VAZIA : LARGURA_COLUNA
              } ${mirada ? "border-acento bg-acento-lavado" : BORDA_ETAPA[etapa]}`}
            >
              <header className="flex items-baseline justify-between gap-2 px-3 pt-3">
                <h2
                  id={`etapa-${etapa}`}
                  className="text-fluid-sm text-titulo truncate font-medium"
                >
                  {ETAPA_LABEL[etapa]}
                </h2>
                <span className="text-fluid-xs text-tenue tabular-nums">
                  {totalReal === 0 ? "—" : totalReal}
                </span>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {vazia ? (
                  <p className="text-fluid-xs text-tenue px-1 py-2">
                    {mirada ? "Solte aqui" : "ninguém"}
                  </p>
                ) : (
                  daEtapa.map((lead) => (
                    <Cartao
                      key={lead.id}
                      lead={lead}
                      mostrarDono={mostrarDono}
                      arrastado={arrasto?.id === lead.id}
                      onMover={(destino) => mover(lead, destino)}
                      onVerDossie={() => setLeadDossie(lead)}
                      onPegar={(evento) => pegar(evento, lead)}
                      onMexer={mexer}
                      onSoltar={soltar}
                      onCancelar={cancelar}
                    />
                  ))
                )}
              </div>

              {faltando > 0 && (
                <Link
                  href={`/corretor/leads?etapa=${etapa}`}
                  className="border-linha text-corpo hover:border-acento-linha hover:text-titulo text-fluid-xs m-3 mt-0 flex min-h-11 items-center justify-center rounded-xl border transition-colors"
                >
                  Ver os outros {faltando}
                </Link>
              )}
            </section>
          );
        })}
      </div>

      {/* O fantasma acompanha o dedo. É `fixed` e mora FORA de qualquer
          coluna: dentro dela o `overflow-y-auto` o cortaria ao sair. Não
          precisa de portal — nenhum ancestral do quadro tem `backdrop-filter`
          nem `transform` (o <main> só tem `isolate`, que não cria containing
          block), a armadilha que este projeto já pisou seis vezes. */}
      {arrasto && (
        <div
          aria-hidden
          className="border-acento bg-elevado text-titulo text-fluid-xs pointer-events-none fixed z-50 max-w-56 truncate rounded-xl border px-3 py-2 shadow-lg"
          style={{ left: arrasto.x, top: arrasto.y, transform: "translate(-50%, -140%)" }}
        >
          {arrasto.nome}
        </div>
      )}

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
  arrastado,
  onMover,
  onVerDossie,
  onPegar,
  onMexer,
  onSoltar,
  onCancelar,
}: {
  lead: Lead;
  mostrarDono: boolean;
  arrastado: boolean;
  onMover: (etapa: EtapaFunil) => void;
  onVerDossie: () => void;
  onPegar: (evento: React.PointerEvent<HTMLElement>) => void;
  onMexer: (evento: React.PointerEvent<HTMLElement>) => void;
  onSoltar: (evento: React.PointerEvent<HTMLElement>) => void;
  onCancelar: () => void;
}) {
  const whatsapp = linkWhatsappLead(lead);
  const parado = diasParado(lead);

  return (
    <article
      className={`border-linha bg-elevado group relative overflow-hidden rounded-xl border p-3 pl-4 transition-opacity ${
        arrastado ? "opacity-40" : ""
      }`}
    >
      {/* A régua da etapa, igual à da lista: mesmo gesto, mesma escala. Aqui
          ela é redundante com a coluna, e isso é de propósito — o cartão
          viaja para a lista e para a ficha, e precisa se explicar sozinho. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${REGUA_ETAPA[lead.etapa]}`}
      />
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1">
          {/* Só a alça leva `touch-none`: o resto do cartão continua rolando
              a coluna com o dedo. Arrastar é atalho, nunca a única porta —
              quem usa teclado move pelo seletor abaixo. */}
          <button
            type="button"
            aria-label={`Arrastar ${lead.nome} para outra etapa`}
            title="Arrastar para outra etapa"
            onPointerDown={onPegar}
            onPointerMove={onMexer}
            onPointerUp={onSoltar}
            onPointerCancel={onCancelar}
            className="text-tenue hover:text-corpo -my-2 -ml-3 flex h-11 w-10 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
              <circle cx="9" cy="6" r="1.6" />
              <circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" />
              <circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" />
              <circle cx="15" cy="18" r="1.6" />
            </svg>
          </button>
          <Link
            href={`/corretor/leads/${lead.id}`}
            className="text-fluid-sm text-titulo hover:text-acento-suave truncate font-medium underline-offset-4 hover:underline"
          >
            {lead.nome}
          </Link>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onVerDossie}
            title="Ver Dossiê de Inteligência do Lead"
            className="bg-acento-lavado text-acento-suave border-acento-linha hover:bg-acento hover:text-sobre-cor flex min-h-8 cursor-pointer items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold transition-colors"
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

      <p className="text-fluid-xs text-tenue mt-1">
        {dataDoCartao(lead)}
        {lead.tipo === "proprietario" && " · tem imóvel"}
        {/* Só a partir de 3 dias: antes disso "parado" é só o fim de semana. */}
        {parado !== null && parado >= 3 && (
          <span className="text-alerta"> · parado há {parado} dias</span>
        )}
      </p>

      {mostrarDono && (
        <p className="text-fluid-xs text-apoio mt-1">{lead.corretor?.nome ?? "Sem dono"}</p>
      )}

      {lead.empreendimento && (
        <p className="text-fluid-xs text-apoio mt-1 truncate">{lead.empreendimento.nome}</p>
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
            className="bg-acento hover:bg-acento-hover text-sobre-cor flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors"
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

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronDown, Megaphone, MessagesSquare, Plus, Repeat, Sprout, Trash2 } from "lucide-react";
import {
  descartarRascunho,
  listarCampanhas,
  type CampanhaListada,
} from "../acoes";
import { BotaoDetalheDaLista, ControlesDaLista } from "./DetalheDaLista";

/**
 * O que já foi enviado. Mostra o CAMINHO de cada lista (roadmap das listas,
 * Fase 1): enviadas → responderam → conversaram → visitas → vendas, com o
 * tempo até a resposta. Antes eram dois números, e "adiantou?" ficava sem
 * resposta.
 *
 * Remodelado em 31/10/2026: um cartão por lista, filtro por situação, a
 * barra do quanto já saiu, os números numa grade só (antes desalinhavam em
 * cada largura) e o placar do A/B e a conferência do texto atrás de
 * "Detalhes" — são para quem quer conferir, não para ler toda vez.
 */

const ROTULO_STATUS: Record<CampanhaListada["status"], string> = {
  rascunho: "Rascunho",
  em_andamento: "Enviando",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const CLASSE_STATUS: Record<CampanhaListada["status"], string> = {
  rascunho: "bg-vidro border-linha-forte text-apoio",
  em_andamento: "bg-acento-lavado border-acento-linha text-acento-suave",
  pausada: "bg-alerta-lavado border-alerta-linha text-alerta",
  concluida: "bg-ok-lavado border-ok-linha text-ok",
  cancelada: "bg-vidro border-linha text-tenue",
};

type Filtro = "todas" | "andamento" | "rascunho" | "encerradas";

const FILTROS: { valor: Filtro; rotulo: string; casa: (c: CampanhaListada) => boolean }[] = [
  { valor: "todas", rotulo: "Todas", casa: () => true },
  { valor: "andamento", rotulo: "Em andamento", casa: (c) => c.status === "em_andamento" || c.status === "pausada" },
  { valor: "rascunho", rotulo: "Rascunhos", casa: (c) => c.status === "rascunho" },
  { valor: "encerradas", rotulo: "Encerradas", casa: (c) => c.status === "concluida" || c.status === "cancelada" },
];

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Tempo até a resposta em palavras curtas: "12 min", "3 h", "2 dias". */
function tempoCurto(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 48 * 60) return `${Math.round(minutos / 60)} h`;
  return `${Math.round(minutos / 1440)} dias`;
}

function Numero({ rotulo, valor, extra, destaque }: { rotulo: string; valor: string; extra?: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-fluid-xs text-apoio">{rotulo}</dt>
      <dd className="mt-0.5 tabular-nums">
        <span className={`text-fluid-base font-semibold ${destaque ? "text-ok" : "text-titulo"}`}>{valor}</span>
        {extra && <span className="text-fluid-xs text-apoio ml-1">{extra}</span>}
      </dd>
    </div>
  );
}

function Selo({ status }: { status: CampanhaListada["status"] }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${CLASSE_STATUS[status]}`}>
      {ROTULO_STATUS[status]}
    </span>
  );
}

const LINK_DA_LISTA =
  "text-fluid-xs text-acento-suave hover:text-titulo flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-medium link-acao";

function CartaoDoRascunho({ c, aoMudar }: { c: CampanhaListada; aoMudar?: () => void }) {
  const [ocupado, iniciar] = useTransition();
  return (
    <li className="border-linha bg-vidro flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Selo status="rascunho" />
          <p className="text-fluid-sm text-titulo font-medium break-words">{c.titulo}</p>
        </div>
        <p className="text-fluid-xs text-apoio mt-1">
          {c.empreendimentoNome ?? "Sem imóvel vinculado"} · salvo em {dataCurta(c.criadoEm)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => {
            if (!confirm("Descartar este rascunho?")) return;
            iniciar(async () => {
              await descartarRascunho(c.id).catch(() => null);
              aoMudar?.();
            });
          }}
          className="text-fluid-xs text-apoio hover:text-perigo flex min-h-11 items-center gap-1 px-3 botao-secundario"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" /> Descartar
        </button>
        <Link
          href={`/corretor/campanhas?rascunho=${c.id}`}
          className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 items-center rounded-xl px-4 font-semibold transition-colors"
        >
          Continuar
        </Link>
      </div>
    </li>
  );
}

function CartaoDaLista({ c, aoMudar }: { c: CampanhaListada; aoMudar?: () => void }) {
  const perc = c.totalLeads > 0 ? Math.round((c.totalEnviados / c.totalLeads) * 100) : 0;
  const taxaResposta = c.totalEnviados > 0 ? Math.round((c.totalRespondidos / c.totalEnviados) * 100) : 0;
  const temDetalhes = Boolean(c.testeAB || c.texto);

  return (
    <li className="cartao p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Selo status={c.status} />
            {c.vivaAte && (
              <span
                title="Quem passar a se encaixar no público entra sozinho"
                className="bg-ok-lavado border-ok-linha text-ok inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
              >
                <Sprout aria-hidden className="h-3 w-3" /> Viva até {dataCurta(c.vivaAte)}
              </span>
            )}
          </div>
          <h3 className="text-fluid-base text-titulo mt-1.5 font-semibold break-words">{c.titulo}</h3>
          <p className="text-fluid-xs text-apoio mt-0.5">
            {c.empreendimentoNome ?? "Sem imóvel vinculado"} · criada em {dataCurta(c.criadoEm)}
            {c.midias > 0 && ` · ${c.midias} foto${c.midias === 1 ? "" : "s"} junto`}
          </p>
        </div>
        <ControlesDaLista campanha={c} aoMudar={aoMudar} />
      </div>

      {c.pausaAutomatica && (
        <p
          role="status"
          className="bg-alerta-lavado border-alerta-linha text-alerta text-fluid-xs mt-3 rounded-xl border px-3 py-2 break-words"
        >
          {c.pausaAutomatica} Revise a lista antes de retomar.
        </p>
      )}

      {/* Quanto já saiu: é a pergunta de quem olha uma lista em andamento. */}
      <div className="mt-4">
        <div className="text-fluid-xs mb-1.5 flex items-baseline justify-between gap-2 tabular-nums">
          <span className="text-corpo">
            <span className="text-titulo font-semibold">{c.totalEnviados}</span> de {c.totalLeads} enviadas
          </span>
          <span className="text-apoio">{perc}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Mensagens enviadas"
          aria-valuemin={0}
          aria-valuemax={c.totalLeads}
          aria-valuenow={c.totalEnviados}
          className="bg-vidro border-linha h-2 overflow-hidden rounded-full border"
        >
          <div
            className={`h-full rounded-full ${c.status === "cancelada" ? "bg-linha-forte" : c.status === "pausada" ? "bg-alerta" : "bg-acento"}`}
            style={{ width: `${Math.min(100, perc)}%` }}
          />
        </div>
      </div>

      {/* O caminho da lista, da entrega à venda (Fase 1). */}
      <dl className="border-linha mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-5">
        <Numero rotulo="Responderam" valor={String(c.totalRespondidos)} extra={`${taxaResposta}%`} destaque={c.totalRespondidos > 0} />
        <Numero rotulo="Conversaram" valor={String(c.funil.conversaram)} />
        <Numero
          rotulo="Respondem em"
          valor={c.funil.medianaRespostaMin === null ? "—" : tempoCurto(c.funil.medianaRespostaMin)}
        />
        <Numero rotulo="Visitas depois" valor={String(c.desfecho.visitas)} />
        <Numero rotulo="Vendas depois" valor={String(c.desfecho.vendas)} />
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-0">
        <BotaoDetalheDaLista campanha={c} />
        {c.totalRespondidos > 0 && (
          <Link href={`/corretor/conversas?lista=${c.id}`} className={LINK_DA_LISTA}>
            <MessagesSquare aria-hidden className="h-3.5 w-3.5" /> Conversas de quem respondeu
          </Link>
        )}
        {c.repetivel && (c.status === "concluida" || c.status === "cancelada") && (
          <Link
            href={`/corretor/campanhas?repetir=${c.id}`}
            title="Monta uma lista nova com o mesmo público e a mesma mensagem"
            className={LINK_DA_LISTA}
          >
            <Repeat aria-hidden className="h-3.5 w-3.5" /> Repetir
          </Link>
        )}
      </div>

      {temDetalhes && (
        <details className="group border-linha mt-2 border-t pt-2">
          <summary className="text-fluid-xs text-apoio hover:text-titulo flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-2 [&::-webkit-details-marker]:hidden">
            <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            {c.testeAB ? "Placar do teste A/B e conferência do texto" : "Conferência do texto"}
          </summary>
          <div className="space-y-3 px-2 pt-1 pb-1">
            {/*
              O placar do teste A/B (0084). Só conta o que foi enviado DURANTE
              o teste: depois da decisão, quem recebe a vencedora não entra.
            */}
            {c.testeAB && (
              <div>
                <div className="text-fluid-xs flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
                  {[c.testeAB.a, c.testeAB.b].map((lado) => (
                    <span key={lado.variante}>
                      <span className="text-apoio">Versão {lado.variante}: </span>
                      <span className="text-titulo font-medium">
                        {lado.respostas} de {lado.enviados} responderam
                      </span>
                      {lado.taxa !== null && <span className="text-apoio"> ({lado.taxa}%)</span>}
                    </span>
                  ))}
                </div>
                <p className={`text-fluid-xs mt-1.5 leading-relaxed ${c.testeAB.temVencedor ? "text-corpo" : "text-apoio"}`}>
                  {c.testeAB.leitura}
                </p>
                {c.vencedora && (
                  <p className="text-fluid-xs text-ok mt-1 font-semibold">
                    A versão {c.vencedora} passou a valer para quem ainda não recebeu
                    {c.vencedoraEm ? ` (desde ${dataCurta(c.vencedoraEm)})` : ""}.
                  </p>
                )}
              </div>
            )}
            {/* A prova de que a lista não mandou texto repetido (0173). */}
            {c.texto && (
              <p className="text-fluid-xs text-apoio break-words">
                {c.texto.conferidas === 1
                  ? "1 mensagem saiu com texto conferido"
                  : `${c.texto.conferidas} mensagens saíram com texto conferido`}
                : nenhuma parecida com outra do seu número. A mais parecida ficou em {c.texto.maisParecidaPct}%.
              </p>
            )}
          </div>
        </details>
      )}
    </li>
  );
}

export function HistoricoCampanhas({
  campanhas,
  aoMudar,
  aoNovaLista,
}: {
  campanhas: CampanhaListada[];
  /** A casca recarrega o status da fila e o histórico quando uma lista muda. */
  aoMudar?: () => void;
  /** Abre o assistente (estado vazio). */
  aoNovaLista?: () => void;
}) {
  const [antigas, setAntigas] = useState<CampanhaListada[]>([]);
  const [semMais, setSemMais] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [carregando, iniciar] = useTransition();

  const todas = [...campanhas, ...antigas.filter((a) => !campanhas.some((c) => c.id === a.id))];

  if (todas.length === 0) {
    return (
      <section className="border-linha-forte flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
        <Megaphone aria-hidden className="text-acento-suave h-7 w-7" />
        <div>
          <h2 className="text-fluid-base text-titulo font-semibold">Nenhuma lista ainda</h2>
          <p className="text-fluid-sm text-apoio mt-1 max-w-md">
            Uma lista manda a mesma conversa, reescrita para cada pessoa, para quem você escolher. Comece por quem
            esfriou: é quem mais responde.
          </p>
        </div>
        {aoNovaLista && (
          <button
            type="button"
            onClick={aoNovaLista}
            className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 items-center gap-1.5 rounded-xl px-4 font-semibold transition-colors"
          >
            <Plus aria-hidden className="h-4 w-4" /> Montar a primeira lista
          </button>
        )}
      </section>
    );
  }

  const filtroDaVez = FILTROS.find((f) => f.valor === filtro)!;
  const visiveis = todas.filter(filtroDaVez.casa);

  function carregarMais() {
    const ultima = todas.at(-1);
    if (!ultima) return;
    iniciar(async () => {
      try {
        const mais = await listarCampanhas(ultima.criadoEm);
        setAntigas((a) => [...a, ...mais]);
        if (mais.length < 20) setSemMais(true);
      } catch {
        setSemMais(true);
      }
    });
  }

  return (
    <section aria-labelledby="titulo-suas-listas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-suas-listas" className="font-display text-titulo text-xl">
          Suas listas
        </h2>
        <div role="group" aria-label="Mostrar listas" className="bg-vidro border-linha flex flex-wrap gap-1 rounded-xl border p-1">
          {FILTROS.map((f) => {
            const n = todas.filter(f.casa).length;
            if (f.valor !== "todas" && n === 0) return null;
            const ativo = filtro === f.valor;
            return (
              <button
                key={f.valor}
                type="button"
                aria-pressed={ativo}
                onClick={() => setFiltro(f.valor)}
                className={`text-fluid-xs flex min-h-9 items-center gap-1.5 rounded-lg px-3 font-medium transition-colors ${
                  ativo ? "bg-superficie text-titulo shadow-sm" : "text-apoio hover:text-titulo"
                }`}
              >
                {f.rotulo}
                <span className="text-tenue tabular-nums">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <p className="text-fluid-sm text-apoio mt-4">Nenhuma lista nesta situação.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visiveis.map((c) =>
            c.status === "rascunho" ? (
              <CartaoDoRascunho key={c.id} c={c} aoMudar={aoMudar} />
            ) : (
              <CartaoDaLista key={c.id} c={c} aoMudar={aoMudar} />
            ),
          )}
        </ul>
      )}

      {!semMais && todas.length >= 20 && (
        <button
          type="button"
          onClick={carregarMais}
          disabled={carregando}
          className="text-fluid-sm border-linha-forte text-corpo hover:text-titulo mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border transition-colors disabled:opacity-60"
        >
          {carregando ? "Carregando…" : "Ver listas mais antigas"}
        </button>
      )}
    </section>
  );
}

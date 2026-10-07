"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Clock, MessagesSquare, Repeat, Sprout, Trash2 } from "lucide-react";
import {
  descartarRascunho,
  liberarEnvioAgora,
  listarCampanhas,
  type CampanhaListada,
} from "../acoes";
import { BotaoDetalheDaLista, ControlesDaLista } from "./DetalheDaLista";

/**
 * O que já foi enviado. Mostra o CAMINHO de cada lista (roadmap das listas,
 * Fase 1): enviadas → responderam → conversaram → visitas → vendas, com o
 * tempo até a resposta. Antes eram dois números, e "adiantou?" ficava sem
 * resposta.
 */

const ROTULO_STATUS: Record<CampanhaListada["status"], string> = {
  rascunho: "Rascunho",
  em_andamento: "Enviando",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const CLASSE_STATUS: Record<CampanhaListada["status"], string> = {
  rascunho: "bg-vidro border-linha text-apoio",
  em_andamento: "bg-alerta-lavado border-alerta-linha text-alerta",
  pausada: "bg-vidro border-linha text-apoio",
  concluida: "bg-ok-lavado border-ok-linha text-ok",
  cancelada: "bg-vidro border-linha text-tenue",
};

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Tempo até a resposta em palavras curtas: "12 min", "3 h", "2 dias". */
function tempoCurto(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 48 * 60) return `${Math.round(minutos / 60)} h`;
  return `${Math.round(minutos / 1440)} dias`;
}

/**
 * Liberar UMA lista fora do horário. Só aparece quando o problema é o
 * horário (a casca sabe), e vale uma vez: depois a lista volta à janela.
 */
function BotaoLiberar({ campanhaId, aoLiberar }: { campanhaId: string; aoLiberar?: () => void }) {
  const [liberando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  function liberar() {
    if (
      !confirm(
        "Esta lista vai sair AGORA, mesmo fora do horário comercial.\n\n" +
          "O intervalo entre uma mensagem e outra continua valendo, e depois desta vez a lista volta ao horário comercial. Confirma?",
      )
    ) {
      return;
    }
    iniciar(async () => {
      try {
        const resultado = await liberarEnvioAgora({ campanhaId });
        setAviso(
          "erro" in resultado
            ? resultado.erro
            : `${resultado.mensagens} mensagem${resultado.mensagens === 1 ? "" : "s"} saindo agora.`,
        );
        if (!("erro" in resultado)) aoLiberar?.();
      } catch {
        setAviso("Não deu certo agora. Recarregue a página e tente de novo.");
      }
    });
  }

  if (aviso) return <span className="text-fluid-xs text-apoio">{aviso}</span>;

  return (
    <button
      type="button"
      onClick={liberar}
      disabled={liberando}
      className="text-fluid-xs border-alerta-linha text-alerta flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 transition-opacity hover:opacity-80 disabled:opacity-60"
    >
      <Clock className="h-3.5 w-3.5" />
      {liberando ? "Liberando…" : "Liberar agora"}
    </button>
  );
}

function Etapa({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="text-tenue block text-[10px]">{rotulo}</span>
      <span className={`font-medium tabular-nums ${destaque ? "text-ok" : "text-titulo"}`}>{valor}</span>
    </div>
  );
}

function LinhaDoRascunho({ c, aoMudar }: { c: CampanhaListada; aoMudar?: () => void }) {
  const [ocupado, iniciar] = useTransition();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-fluid-sm text-titulo font-medium break-words">{c.titulo}</p>
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${CLASSE_STATUS.rascunho}`}>
            {ROTULO_STATUS.rascunho}
          </span>
        </div>
        <p className="text-fluid-xs text-apoio mt-0.5">
          {c.empreendimentoNome ?? "Sem imóvel vinculado"} · salvo em {dataCurta(c.criadoEm)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/corretor/campanhas?rascunho=${c.id}`}
          className="text-fluid-xs bg-acento text-sobre-cor flex min-h-11 items-center rounded-xl px-3.5 font-medium"
        >
          Continuar
        </Link>
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
          className="text-fluid-xs text-apoio hover:text-perigo flex min-h-11 items-center gap-1 px-2"
        >
          <Trash2 className="h-3.5 w-3.5" /> Descartar
        </button>
      </div>
    </li>
  );
}

export function HistoricoCampanhas({
  campanhas,
  aoMudar,
  foraDoHorario = false,
}: {
  campanhas: CampanhaListada[];
  /** A casca recarrega o status da fila e o histórico quando uma lista muda. */
  aoMudar?: () => void;
  /** A fila espera o horário: só então "Liberar agora" faz sentido. */
  foraDoHorario?: boolean;
}) {
  const [antigas, setAntigas] = useState<CampanhaListada[]>([]);
  const [semMais, setSemMais] = useState(false);
  const [carregando, iniciar] = useTransition();

  const todas = [...campanhas, ...antigas.filter((a) => !campanhas.some((c) => c.id === a.id))];

  if (todas.length === 0) {
    return (
      <p className="text-fluid-sm text-tenue py-6 text-center">
        Nenhuma lista de transmissão ainda. A primeira você cria aí em cima.
      </p>
    );
  }

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
    <section>
      <h2 className="font-display text-titulo text-lg">Suas listas</h2>

      <ul className="divide-linha mt-3 divide-y">
        {todas.map((c) => {
          if (c.status === "rascunho") return <LinhaDoRascunho key={c.id} c={c} aoMudar={aoMudar} />;

          const perc = c.totalLeads > 0 ? Math.round((c.totalEnviados / c.totalLeads) * 100) : 0;
          const taxaResposta =
            c.totalEnviados > 0 ? Math.round((c.totalRespondidos / c.totalEnviados) * 100) : 0;

          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-fluid-sm text-titulo font-medium break-words">{c.titulo}</p>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${CLASSE_STATUS[c.status]}`}
                  >
                    {ROTULO_STATUS[c.status]}
                  </span>
                  {c.vivaAte && (
                    <span
                      title="Quem passar a se encaixar no público entra sozinho"
                      className="bg-ok-lavado border-ok-linha text-ok flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold"
                    >
                      <Sprout className="h-3 w-3" /> Viva até {dataCurta(c.vivaAte)}
                    </span>
                  )}
                </div>
                <p className="text-fluid-xs text-apoio mt-0.5">
                  {c.empreendimentoNome ?? "Sem imóvel vinculado"} · {dataCurta(c.criadoEm)}
                  {c.midias > 0 && ` · ${c.midias} foto${c.midias === 1 ? "" : "s"} junto`}
                </p>
              </div>

              {c.pausaAutomatica && (
                <p
                  role="status"
                  className="bg-alerta-lavado border-alerta-linha text-alerta text-fluid-xs w-full rounded-xl border px-3 py-2 break-words"
                >
                  {c.pausaAutomatica} Revise a lista antes de retomar.
                </p>
              )}

              {/* O caminho da lista, da entrega à venda (Fase 1). */}
              <div className="text-fluid-xs grid w-full grid-cols-3 gap-x-4 gap-y-2 sm:w-auto sm:grid-cols-6">
                <Etapa rotulo="Enviadas" valor={`${c.totalEnviados}/${c.totalLeads} (${perc}%)`} />
                <Etapa rotulo="Responderam" valor={`${c.totalRespondidos} (${taxaResposta}%)`} destaque />
                <Etapa rotulo="Conversaram" valor={String(c.funil.conversaram)} />
                <Etapa
                  rotulo="Resposta em"
                  valor={c.funil.medianaRespostaMin === null ? "—" : tempoCurto(c.funil.medianaRespostaMin)}
                />
                <Etapa rotulo="Visitas" valor={String(c.desfecho.visitas)} />
                <Etapa rotulo="Vendas" valor={String(c.desfecho.vendas)} />
              </div>

              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <BotaoDetalheDaLista campanha={c} />
                  {c.totalRespondidos > 0 && (
                    <Link
                      href={`/corretor/conversas?lista=${c.id}`}
                      className="text-fluid-xs text-acento flex min-h-11 items-center gap-1 rounded-xl px-2 font-medium hover:underline"
                    >
                      <MessagesSquare className="h-3.5 w-3.5" /> Conversas de quem respondeu
                    </Link>
                  )}
                  {c.repetivel && (c.status === "concluida" || c.status === "cancelada") && (
                    <Link
                      href={`/corretor/campanhas?repetir=${c.id}`}
                      title="Monta uma lista nova com o mesmo público e a mesma mensagem"
                      className="text-fluid-xs text-acento flex min-h-11 items-center gap-1 rounded-xl px-2 font-medium hover:underline"
                    >
                      <Repeat className="h-3.5 w-3.5" /> Repetir
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {foraDoHorario && c.status === "em_andamento" && c.totalEnviados < c.totalLeads && (
                    <BotaoLiberar campanhaId={c.id} aoLiberar={aoMudar} />
                  )}
                  <ControlesDaLista campanha={c} aoMudar={aoMudar} />
                </div>
              </div>

              {/*
                O placar do teste A/B (0084). Só conta o que foi enviado
                DURANTE o teste: depois da decisão, quem recebe a vencedora
                não entra no placar.
              */}
              {c.testeAB && (
                <div className="border-linha bg-elevado w-full rounded-xl border p-3">
                  <div className="text-fluid-xs flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
                    {[c.testeAB.a, c.testeAB.b].map((lado) => (
                      <span key={lado.variante}>
                        <span className="text-tenue">Versão {lado.variante}: </span>
                        <span className="text-titulo font-medium">
                          {lado.respostas}/{lado.enviados}
                        </span>
                        {lado.taxa !== null && <span className="text-apoio"> ({lado.taxa}%)</span>}
                      </span>
                    ))}
                  </div>
                  <p
                    className={`text-fluid-xs mt-1.5 leading-relaxed ${
                      c.testeAB.temVencedor ? "text-corpo" : "text-apoio"
                    }`}
                  >
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
            </li>
          );
        })}
      </ul>

      {!semMais && todas.length >= 20 && (
        <button
          type="button"
          onClick={carregarMais}
          disabled={carregando}
          className="text-fluid-sm border-linha-forte text-corpo hover:text-titulo mt-2 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl border transition-colors disabled:opacity-60"
        >
          {carregando ? "Carregando…" : "Ver listas mais antigas"}
        </button>
      )}
    </section>
  );
}

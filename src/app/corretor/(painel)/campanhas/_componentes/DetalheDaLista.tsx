"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Ban, ChevronRight, Pause, Play, X } from "lucide-react";
import { ROTULO_DO_ITEM } from "@/lib/crm/desfechoDaLista";
import {
  cancelarCampanha,
  detalharCampanha,
  pausarCampanha,
  retomarCampanha,
  type CampanhaListada,
  type ItemDaLista,
} from "../acoes";

/**
 * Quem está na lista e o que aconteceu com cada um, mais os três controles
 * da lista (Fase 1 do plano das listas, 03/10/2026).
 *
 * `<dialog>` nativo e não um portal: ele vai para a camada de topo do
 * navegador sem sair da árvore do DOM, então herda a paleta do painel
 * (`data-rota`/`data-modulo`) e escapa de qualquer `backdrop-filter` acima.
 */

const CLASSE_DO_ITEM: Record<ItemDaLista["status"], string> = {
  pendente: "text-apoio",
  enviado: "text-titulo",
  respondido: "text-ok",
  erro: "text-perigo",
};

function quando(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function linhaDoItem(i: ItemDaLista): string {
  if (i.status === "respondido") return `Respondeu ${quando(i.respostaEm)}`;
  if (i.status === "enviado") return `Enviada ${quando(i.enviadoEm)}`;
  if (i.status === "erro") return i.erroMotivo ?? "Não enviada";
  return `Na fila · ${quando(i.agendadoPara)}`;
}

export function ControlesDaLista({
  campanha,
  aoMudar,
}: {
  campanha: CampanhaListada;
  aoMudar?: () => void;
}) {
  const [ocupado, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  function rodar(acao: () => Promise<{ erro: string } | { ok: true }>, sucesso: string) {
    iniciar(async () => {
      try {
        const r = await acao();
        setAviso("erro" in r ? r.erro : sucesso);
        if (!("erro" in r)) aoMudar?.();
      } catch {
        setAviso("Não deu certo agora. Recarregue a página e tente de novo.");
      }
    });
  }

  const aberta = campanha.status === "em_andamento" || campanha.status === "pausada";
  if (!aberta) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {campanha.status === "em_andamento" ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => rodar(() => pausarCampanha(campanha.id), "Lista pausada. Nada sai até você retomar.")}
          className="text-fluid-xs border-linha text-corpo flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 hover:opacity-80 disabled:opacity-60"
        >
          <Pause className="h-3.5 w-3.5" />
          Pausar
        </button>
      ) : (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => rodar(() => retomarCampanha(campanha.id), "Lista retomada.")}
          className="text-fluid-xs border-ok-linha text-ok flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 hover:opacity-80 disabled:opacity-60"
        >
          <Play className="h-3.5 w-3.5" />
          Retomar
        </button>
      )}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => {
          if (
            !confirm(
              "Cancelar esta lista? Quem ainda não recebeu não recebe mais. Não dá para desfazer.",
            )
          ) {
            return;
          }
          rodar(async () => {
            const r = await cancelarCampanha(campanha.id);
            return "erro" in r ? r : { ok: true as const };
          }, "Lista cancelada.");
        }}
        className="text-fluid-xs border-perigo-linha text-perigo flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 hover:opacity-80 disabled:opacity-60"
      >
        <Ban className="h-3.5 w-3.5" />
        Cancelar
      </button>
      {aviso && <span className="text-fluid-xs text-apoio">{aviso}</span>}
    </div>
  );
}

export function BotaoDetalheDaLista({ campanha }: { campanha: CampanhaListada }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [itens, setItens] = useState<ItemDaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();

  function abrir() {
    dialogo.current?.showModal();
    setErro(null);
    iniciar(async () => {
      try {
        const r = await detalharCampanha(campanha.id);
        if ("erro" in r) setErro(r.erro);
        else setItens(r.itens);
      } catch {
        setErro("Não deu certo agora. Recarregue a página e tente de novo.");
      }
    });
  }

  const contagem = (itens ?? []).reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="text-fluid-xs text-acento flex min-h-11 cursor-pointer items-center gap-1 rounded-xl px-2 font-medium hover:underline"
      >
        Ver quem recebeu
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      <dialog
        ref={dialogo}
        onClick={(e) => {
          // Toque fora do cartão fecha, como toda gaveta do painel.
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
        className="bg-superficie text-corpo border-linha m-auto max-h-[85dvh] w-[min(36rem,calc(100vw-2rem))] rounded-2xl border p-0 backdrop:bg-black/50"
      >
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="font-display text-titulo text-lg break-words">{campanha.titulo}</p>
            <p className="text-fluid-xs text-apoio mt-0.5">
              {campanha.empreendimentoNome ?? "Sem imóvel vinculado"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogo.current?.close()}
            aria-label="Fechar"
            className="text-apoio flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl hover:opacity-80"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {itens && (
          <p className="text-fluid-xs text-apoio flex flex-wrap gap-x-4 gap-y-1 px-4 tabular-nums">
            {(["respondido", "enviado", "pendente", "erro"] as const)
              .filter((s) => contagem[s])
              .map((s) => (
                <span key={s}>
                  {ROTULO_DO_ITEM[s]}: <span className="text-titulo font-medium">{contagem[s]}</span>
                </span>
              ))}
          </p>
        )}

        <div className="mt-3 max-h-[60dvh] overflow-y-auto px-4 pb-4">
          {carregando && !itens && <p className="text-fluid-sm text-apoio py-6 text-center">Carregando…</p>}
          {erro && <p className="text-fluid-sm text-perigo py-6 text-center">{erro}</p>}
          {itens && itens.length === 0 && (
            <p className="text-fluid-sm text-apoio py-6 text-center">Ninguém nesta lista.</p>
          )}
          {itens && itens.length > 0 && (
            <ul className="divide-linha divide-y">
              {itens.map((i) => (
                <li key={i.id} className="flex min-w-0 items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    {i.leadId ? (
                      <Link
                        href={`/corretor/leads/${i.leadId}`}
                        className="text-fluid-sm text-titulo block truncate font-medium hover:underline"
                      >
                        {i.nome}
                      </Link>
                    ) : (
                      <p className="text-fluid-sm text-titulo truncate font-medium">{i.nome}</p>
                    )}
                    <p className={`text-fluid-xs break-words ${CLASSE_DO_ITEM[i.status]}`}>{linhaDoItem(i)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </dialog>
    </>
  );
}

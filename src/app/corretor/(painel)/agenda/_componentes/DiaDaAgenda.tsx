"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ItemDaAgenda } from "@/lib/agenda/itens";
import type { DadosDoPreparo } from "@/lib/crm/preparoDaVisita";
import { posicaoDoAgora } from "@/lib/agenda/semana";
import { CartaoDaVisita } from "./CartaoDaVisita";
import { CancelarCompromisso } from "./FormulariosDeCompromisso";
import { PassarVisita } from "./PassarVisita";
import { Gaveta } from "./Gaveta";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const hora = (iso: string) => HORA.format(new Date(iso));

const STATUS: Record<string, string> = {
  marcada: "Marcada",
  realizada: "Aconteceu",
  faltou: "Cliente faltou",
  sem_confirmacao: "Sem confirmação",
  cancelada: "Cancelada",
};

/** A cor de cada tipo: a barrinha da linha e o realce da gaveta. */
function corDoItem(item: ItemDaAgenda): string {
  if (item.tipo === "visita") return "bg-acento";
  if (item.tipo === "tarefa") return "bg-alerta";
  if (item.tipo === "lembrete") return "bg-ok";
  return item.subtipo === "reuniao" ? "bg-info" : "bg-linha-forte";
}

function textosDoItem(item: ItemDaAgenda, modo: "minha" | "equipe"): { titulo: string; apoio: string } {
  switch (item.tipo) {
    case "visita": {
      if (modo === "equipe") {
        return { titulo: item.nome, apoio: `${item.corretorNome ?? "Corretor"} · ${STATUS[item.status ?? "marcada"] ?? "Marcada"}` };
      }
      const situacao =
        item.status && item.status !== "marcada"
          ? (STATUS[item.status] ?? "Visita")
          : item.remarcacaoPedidaEm
            ? "pediu para remarcar"
            : item.confirmadaPeloCliente
              ? "confirmada"
              : item.confirmacaoPedidaEm
                ? "confirmação pedida"
                : "a confirmar";
      return { titulo: item.nome, apoio: [`Visita · ${situacao}`, item.imovel?.nome].filter(Boolean).join(" · ") };
    }
    case "compromisso": {
      const reuniao = item.subtipo === "reuniao";
      const titulo = reuniao ? item.titulo || "Reunião" : item.titulo || "Horário bloqueado";
      const quem = item.corretorNome ? `${item.corretorNome} · ` : "";
      return { titulo, apoio: `${quem}${reuniao ? "Reunião" : "Bloqueado"} · até ${hora(item.fim)}` };
    }
    case "tarefa":
      return { titulo: item.titulo, apoio: item.nome ? `Tarefa · ${item.nome}` : "Tarefa" };
    case "lembrete":
      return { titulo: item.texto, apoio: "Lembrete" };
  }
}

const chave = (item: ItemDaAgenda) => `${item.tipo}-${item.id}`;

/**
 * O dia da Agenda (visual de 28/10/2026): uma lista fina — hora, a barrinha
 * da cor do tipo, quem e a situação — com a linha do "agora" no dia de hoje.
 * Tocar num item abre o detalhe: numa gaveta no celular e no computador
 * médio; na tela larga (xl), na coluna da direita, que já começa na primeira
 * visita do dia.
 */
export function DiaDaAgenda({
  itens,
  preparoPorLead,
  vistaDe,
  agoraIso,
  dia,
  modo = "minha",
  equipe = [],
  vazio,
}: {
  itens: ItemDaAgenda[];
  preparoPorLead: Record<string, DadosDoPreparo>;
  vistaDe?: string;
  agoraIso: string;
  dia: string;
  modo?: "minha" | "equipe";
  equipe?: { id: string; nome: string }[];
  /** O que dizer no dia sem nada. */
  vazio: string;
}) {
  const agora = new Date(agoraIso);
  const inicial = itens.find((i) => i.tipo === "visita") ?? itens[0];
  const [escolhido, setEscolhido] = useState<string | null>(inicial ? chave(inicial) : null);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const fechar = useCallback(() => setGavetaAberta(false), [setGavetaAberta]);

  if (itens.length === 0) {
    return (
      <div className="cartao p-5">
        <p className="text-fluid-sm text-corpo">{vazio}</p>
      </div>
    );
  }

  const agoraEm = posicaoDoAgora(itens, agora, dia);
  const atual = itens.find((i) => chave(i) === escolhido) ?? inicial;

  const escolher = (item: ItemDaAgenda) => {
    setEscolhido(chave(item));
    // Na tela larga o detalhe já está ao lado; abaixo dela, sobe a gaveta.
    if (!window.matchMedia("(min-width: 1280px)").matches) setGavetaAberta(true);
  };

  const detalhe = atual ? (
    <DetalheDoItem item={atual} preparo={preparoDoItem(atual, preparoPorLead)} vistaDe={vistaDe} modo={modo} equipe={equipe} agora={agora} />
  ) : null;

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-6">
      <ul className="cartao divide-y divide-linha overflow-hidden p-0">
        {itens.map((item, i) => {
          const { titulo, apoio } = textosDoItem(item, modo);
          const ativo = atual && chave(item) === chave(atual);
          const passou = Date.parse(item.tipo === "compromisso" ? item.fim : item.inicio) < agora.getTime() - 60 * 60_000;
          return (
            <li key={chave(item)} className="relative">
              {agoraEm === i && <LinhaDoAgora />}
              <button
                type="button"
                onClick={() => escolher(item)}
                aria-current={ativo ? "true" : undefined}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-elevado",
                  ativo && "xl:bg-acento-lavado",
                  passou && "opacity-60",
                )}
              >
                <span className="w-12 shrink-0 text-sm font-semibold text-titulo tabular-nums">{hora(item.inicio)}</span>
                <span
                  aria-hidden
                  className={cn(
                    "w-1 self-stretch rounded-full",
                    corDoItem(item),
                    item.tipo === "compromisso" && item.subtipo === "bloqueio" && "bg-[repeating-linear-gradient(180deg,var(--color-linha-forte)_0_4px,transparent_4px_7px)]",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-fluid-sm block truncate font-medium text-titulo">{titulo}</span>
                  <span className="text-fluid-xs block truncate text-apoio">{apoio}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-tenue" aria-hidden />
              </button>
              {agoraEm === itens.length && i === itens.length - 1 && <LinhaDoAgora embaixo />}
            </li>
          );
        })}
      </ul>

      <aside className="sticky top-4 hidden xl:block" aria-label="Detalhe do compromisso">
        <div className="cartao p-5">{detalhe}</div>
      </aside>

      <Gaveta titulo="Detalhe" aberta={gavetaAberta} onFechar={fechar}>
        {detalhe}
      </Gaveta>
    </div>
  );
}

function preparoDoItem(item: ItemDaAgenda, preparoPorLead: Record<string, DadosDoPreparo>): DadosDoPreparo {
  return item.tipo === "visita" ? (preparoPorLead[item.leadId] ?? {}) : {};
}

function LinhaDoAgora({ embaixo = false }: { embaixo?: boolean }) {
  return (
    <span
      aria-label="Agora"
      role="separator"
      className={cn("pointer-events-none absolute inset-x-0 z-10 flex items-center", embaixo ? "bottom-0" : "top-0")}
    >
      <span className="ml-14 h-2 w-2 -translate-x-1 rounded-full bg-perigo" />
      <span className="h-0.5 flex-1 bg-perigo" />
    </span>
  );
}

function DetalheDoItem({
  item,
  preparo,
  vistaDe,
  modo,
  equipe,
  agora,
}: {
  item: ItemDaAgenda;
  preparo: DadosDoPreparo;
  vistaDe?: string;
  modo: "minha" | "equipe";
  equipe: { id: string; nome: string }[];
  agora: Date;
}) {
  if (item.tipo === "visita") {
    return (
      <div className="space-y-3">
        <CartaoDaVisita
          visita={item}
          preparo={preparo}
          vistaDe={modo === "minha" ? vistaDe : undefined}
          agoraIso={modo === "minha" ? agora.toISOString() : undefined}
          semMoldura
        />
        {modo === "equipe" && (
          <p className="text-fluid-xs text-apoio">
            Com {item.corretorNome ?? "o corretor"} · {STATUS[item.status ?? "marcada"] ?? "Marcada"}
            {item.passada ? " · passada pelo gestor" : ""}
          </p>
        )}
        {modo === "equipe" && item.status === "marcada" && Date.parse(item.inicio) > agora.getTime() && item.corretorId && (
          <PassarVisita visitaId={item.id} corretorAtualId={item.corretorId} equipe={equipe} />
        )}
      </div>
    );
  }

  const { titulo, apoio } = textosDoItem(item, modo);
  const quando = item.tipo === "compromisso" ? `${hora(item.inicio)}–${hora(item.fim)}` : hora(item.inicio);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-1 h-10 w-1 shrink-0 rounded-full", corDoItem(item))} />
        <div className="min-w-0">
          <p className="text-fluid-xs text-apoio">{quando}</p>
          <p className="font-display text-lg break-words text-titulo">{titulo}</p>
          <p className="text-fluid-xs text-apoio">{apoio}</p>
        </div>
      </div>
      {item.tipo === "compromisso" && item.podeCancelar && (
        <CancelarCompromisso id={item.id} rotulo={item.subtipo === "reuniao" ? "Cancelar reunião" : "Liberar horário"} />
      )}
      {(item.tipo === "tarefa" || item.tipo === "lembrete") && (
        <Link
          href={item.leadId ? `/corretor/leads/${item.leadId}` : "/corretor/anotacoes"}
          className="botao-secundario inline-flex min-h-11 items-center px-4 text-sm"
        >
          {item.leadId ? "Abrir ficha" : "Ver anotações"}
        </Link>
      )}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { INTERVALO_EM_PALAVRAS } from "@/lib/whatsapp/antiBan";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import Link from "next/link";
import { CircleAlert, Inbox, MoreHorizontal, Trash2, WifiOff } from "lucide-react";
import {
  limparFilaDisparo,
  statusDisparo,
  type StatusDisparo,
} from "../acoes";

/**
 * "Como estão os envios", em português de gente (roadmap F4).
 *
 * O painel antigo mostrava três números crus — pendentes, cota, próximo
 * envio — mais dois botões perigosos sempre à vista. Cota, fila e instância
 * são vocabulário de quem construiu o sistema; o corretor quer saber se as
 * mensagens estão saindo e quando as outras saem.
 *
 * A proteção anti-ban é explicada como CUIDADO, não como limite: o número é
 * dele, e uma linha bloqueada não volta com deploy.
 */

function horaDeBrasilia(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * A frase da previsão (roadmap das listas, Fase 1). A tela dizia "saem uma
 * a cada minuto", mas o intervalo real é o sorteio de `antiBan.ts`, e o que o
 * corretor quer saber é QUANDO termina.
 */
function frasePrincipal(status: StatusDisparo): string {
  if (status.impedimento) return status.impedimento;
  if (status.pendentes === 0) return "Nenhuma mensagem esperando para sair.";

  const n = status.pendentes;
  const plural = n === 1 ? "" : "s";
  if (status.terminaEm && status.continuaAmanha === 0) {
    return `${n} mensagem${plural} na fila — devem terminar por volta das ${horaDeBrasilia(status.terminaEm)}.`;
  }
  if (status.terminaEm && status.continuaAmanha > 0) {
    const hoje = n - status.continuaAmanha;
    return `Hoje saem ${hoje} mensagem${hoje === 1 ? "" : "s"}, até por volta das ${horaDeBrasilia(status.terminaEm)}; as outras ${status.continuaAmanha} continuam no próximo dia, sozinhas.`;
  }
  return `${n} mensagem${plural} na fila — saem sozinhas, com ${INTERVALO_EM_PALAVRAS} entre uma e outra.`;
}

export function StatusFila({
  statusInicial,
  aoMudar,
}: {
  statusInicial: StatusDisparo | null;
  /** A casca recarrega o histórico quando a fila muda. */
  aoMudar?: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<StatusDisparo | null>(statusInicial);
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
  const { avisar, falhar } = useAvisos();
  const [limpando, iniciarLimpeza] = useTransition();

  if (!status) return null;

  const parada = Boolean(status.impedimento);

  async function atualizar() {
    setStatus(await statusDisparo());
    await aoMudar?.();
  }

  /**
   * Esvazia a fila. Confirmação obrigatória: some com mensagens que o
   * corretor programou, e não há como desfazer.
   */
  function limparFila() {
    const pendentes = status?.pendentes ?? 0;
    if (
      !confirm(
        `Isso apaga ${pendentes} mensagem(ns) que ainda não saíram. As já enviadas continuam no histórico. Não dá para desfazer. Confirma?`,
      )
    ) {
      return;
    }
    iniciarLimpeza(async () => {
      const resultado = await limparFilaDisparo();
      if ("erro" in resultado) {
        falhar(resultado.erro);
        return;
      }
      await atualizar();
      avisar(
        resultado.removidos === 0
          ? "Não havia nada programado."
          : `${resultado.removidos} mensagem(ns) programada(s) cancelada(s).`,
      );
    });
  }

  const conectar = status.impedimentoTipo === "desconectado" || status.impedimentoTipo === "sem_numero";
  const titulo = parada ? "As mensagens não estão saindo" : status.pendentes > 0 ? "Enviando" : "Fila vazia";

  /*
   * Faixa de uma linha (31/10/2026): antes era um cartão do tamanho do
   * assistente para dizer uma frase. O ponto diz o estado de longe; a frase,
   * quando termina; o porquê do limite fica em letra menor. "Apagar as que
   * não saíram" continua atrás de uma porta: apaga, e não é rotina.
   */
  return (
    <section
      aria-label="Situação dos envios"
      className={`rounded-2xl border px-4 py-3.5 sm:px-5 ${
        parada ? "border-alerta-linha bg-alerta-lavado" : "border-linha bg-superficie"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          {/* O número da fila é o que se lê de longe; parada, o alerta. */}
          <span
            className={`relative flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${
              parada ? "bg-alerta text-sobre-cor" : status.pendentes > 0 ? "bg-acento text-sobre-cor" : "bg-vidro text-apoio"
            }`}
          >
            {parada ? (
              <CircleAlert aria-hidden className="h-6 w-6" />
            ) : status.pendentes > 0 ? (
              <>
                <span className="text-lg leading-none font-semibold tabular-nums">{status.pendentes}</span>
                <span className="mt-0.5 text-[10px] leading-none font-medium">na fila</span>
                <span aria-hidden className="bg-ok ring-superficie absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 motion-safe:animate-pulse" />
              </>
            ) : (
              <Inbox aria-hidden className="h-6 w-6" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-fluid-sm text-corpo">
              <span className="text-titulo font-semibold">{titulo}.</span> {frasePrincipal(status)}
            </p>
            {/* O limite de hoje sai do USO da última semana (0158): dizer por
                que ele é esse evita a surpresa de um número parado voltar baixo. */}
            {status.explicacaoDoLimite && (status.pendentes > 0 || status.impedimentoTipo === "cota") && (
              <p className="text-fluid-xs text-apoio mt-0.5">
                {status.explicacaoDoLimite} O espaçamento de {INTERVALO_EM_PALAVRAS} entre as mensagens protege seu número.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {conectar && (
            <Link
              href="/corretor/whatsapp"
              className="text-fluid-sm border-alerta-linha text-alerta flex min-h-11 items-center gap-1.5 rounded-xl border px-4 font-medium hover:opacity-80"
            >
              <WifiOff aria-hidden className="h-4 w-4" />
              Conectar o número
            </Link>
          )}
          {status.pendentes > 0 && (
            <button
              type="button"
              onClick={() => setMostrarAvancado((m) => !m)}
              aria-expanded={mostrarAvancado}
              aria-label="Mais opções da fila"
              title="Mais opções da fila"
              className="text-apoio hover:text-titulo flex h-11 w-11 items-center justify-center botao-icone"
            >
              <MoreHorizontal aria-hidden className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/*
        O sucesso e o erro vão para a região de avisos do shell: a faixa fica
        acima do assistente, e quem age no rodapé dele não veria a resposta
        aqui. "Liberar envios de hoje" saiu na 0155; "Liberar envio agora" e
        "Enviar agora" saíram em 09/10/2026, a pedido: a fila só anda pelo
        disparador, no horário.
      */}
      {mostrarAvancado && status.pendentes > 0 && (
        <div className="border-linha mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
          <p className="text-fluid-xs text-apoio min-w-0 flex-1">
            Apagar a fila tira as {status.pendentes} mensagens que ainda não saíram, de todas as listas. As enviadas
            continuam no histórico.
          </p>
          <button
            type="button"
            onClick={limparFila}
            disabled={limpando}
            className="text-fluid-xs border-perigo-linha bg-perigo-lavado text-perigo flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 transition-opacity hover:opacity-80 disabled:opacity-60"
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            {limpando ? "Apagando…" : "Apagar as que não saíram"}
          </button>
        </div>
      )}
    </section>
  );
}

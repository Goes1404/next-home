"use client";

import { useState, useTransition } from "react";
import { INTERVALO_EM_PALAVRAS } from "@/lib/whatsapp/antiBan";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import Link from "next/link";
import { Trash2 } from "lucide-react";
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
  if (status.pendentes === 0) return "Nenhuma mensagem esperando. Crie uma lista de transmissão abaixo.";

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

  return (
    <section
      className={`rounded-2xl border p-5 sm:p-6 ${
        parada ? "border-alerta-linha bg-alerta-lavado" : "border-linha bg-superficie"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${
                parada ? "bg-alerta" : status.pendentes > 0 ? "bg-ok animate-pulse" : "bg-linha-forte"
              }`}
            />
            <h2 className="font-display text-titulo text-lg">
              {parada ? "As mensagens não estão saindo" : "Suas mensagens"}
            </h2>
          </div>
          <p className="text-fluid-sm text-corpo mt-1.5">{frasePrincipal(status)}</p>

          {!parada && status.pendentes > 0 && (
            <p className="text-fluid-xs text-tenue mt-1">
              O espaçamento entre uma mensagem e outra protege seu número de ser bloqueado pelo
              WhatsApp.
            </p>
          )}

          {/* O limite de hoje sai do USO da última semana (0158): dizer por
              que ele é esse evita a surpresa de um número parado voltar baixo. */}
          {status.explicacaoDoLimite && (status.pendentes > 0 || status.impedimentoTipo === "cota") && (
            <p className="text-fluid-xs text-tenue mt-1">{status.explicacaoDoLimite}</p>
          )}
        </div>

        {(status.impedimentoTipo === "desconectado" || status.impedimentoTipo === "sem_numero") && (
          <Link
            href="/corretor/whatsapp"
            className="text-fluid-sm border-alerta-linha text-alerta flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-4 hover:opacity-80"
          >
            Conectar o número
          </Link>
        )}

      </div>

      {/*
        O sucesso e o erro saíram daqui para a região de avisos do shell.
        Este cartão fica no MEIO da tela de campanhas, abaixo do cabeçalho e
        das abas, e acima do assistente — quem toca "Enviar agora" no rodapé
        do assistente não via a confirmação que aparecia aqui em cima. E o
        `setTimeout` que apagava o texto em 8s contrariava a regra do próprio
        `Avisos`: sucesso some sozinho, erro fica até alguém fechar.
      */}

      {/* Ferramenta que apaga coisa fica atrás de uma porta: limpar a fila
          apaga mensagens programadas, e não é rotina. "Liberar envios de
          hoje" saiu na 0155; "Liberar envio agora" e "Enviar agora" saíram
          em 09/10/2026, a pedido: a fila só anda pelo disparador, no horário. */}
      {status.pendentes > 0 && (
        <>
          <button
            type="button"
            onClick={() => setMostrarAvancado((m) => !m)}
            aria-expanded={mostrarAvancado}
            className="text-fluid-xs text-tenue hover:text-apoio mt-4 min-h-11 cursor-pointer transition-colors"
          >
            {mostrarAvancado ? "− Ocultar avançado" : "+ Avançado"}
          </button>

          {mostrarAvancado && (
            <div className="border-linha mt-2 flex flex-wrap gap-2 border-t pt-4">
              {status.pendentes > 0 && (
                <button
                  type="button"
                  onClick={limparFila}
                  disabled={limpando}
                  className="text-fluid-xs border-perigo-linha bg-perigo-lavado text-perigo flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 transition-opacity hover:opacity-80 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {limpando ? "Limpando…" : "Apagar as que não saíram"}
                </button>
              )}

            </div>
          )}
        </>
      )}
    </section>
  );
}

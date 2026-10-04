"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import Link from "next/link";
import { Clock, Trash2, Zap } from "lucide-react";
import {
  liberarEnvioAgora,
  limparFilaDisparo,
  processarFilaAgora,
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
 * a cada minuto", mas o intervalo real é de 35 a 75 segundos, e o que o
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
  return `${n} mensagem${plural} na fila — saem sozinhas, com 35 a 75 segundos entre uma e outra.`;
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
  const [processando, iniciarProcessamento] = useTransition();
  const [limpando, iniciarLimpeza] = useTransition();
  const [liberando, iniciarLiberacao] = useTransition();

  if (!status) return null;

  const parada = Boolean(status.impedimento);

  async function atualizar() {
    setStatus(await statusDisparo());
    await aoMudar?.();
  }

  function empurrar() {
    iniciarProcessamento(async () => {
      const resultado = await processarFilaAgora();
      if ("erro" in resultado) {
        falhar(resultado.erro);
        return;
      }
      await atualizar();
      avisar(
        resultado.processados === 0
          ? "Nada para enviar neste instante — as mensagens seguem saindo sozinhas."
          : `${resultado.enviados} mensagem${resultado.enviados === 1 ? "" : "s"} enviada${resultado.enviados === 1 ? "" : "s"} agora.` +
              (resultado.restantes > 0 ? ` Faltam ${resultado.restantes}.` : " Não sobrou nenhuma."),
      );
    });
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

  /**
   * Solta UMA VEZ a fila que está esperando o horário (ver
   * `liberarEnvioAgora`). Só aparece quando o problema é o horário: cota,
   * número caído ou bloqueado não se resolvem por aqui.
   */
  function liberar() {
    if (
      !confirm(
        "As mensagens vão sair AGORA, mesmo fora do horário comercial.\n\n" +
          "O intervalo entre uma e outra continua valendo — o que muda é só a espera pela " +
          "manhã. Mensagem de propaganda de madrugada é o que mais gera denúncia, e denúncia " +
          "é o que derruba um número. Confirma?",
      )
    ) {
      return;
    }
    iniciarLiberacao(async () => {
      const resultado = await liberarEnvioAgora();
      if ("erro" in resultado) {
        falhar(resultado.erro);
        return;
      }
      await atualizar();
      avisar(
        `Liberado: ${resultado.mensagens} mensagem${resultado.mensagens === 1 ? "" : "s"} saindo agora, com 35 a 75 segundos entre uma e outra. Depois disso as listas voltam ao horário comercial.`,
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
        </div>

        {/* Quando a fila está parada, o botão útil é o que a solta — não o
            "enviar agora", que respeita a mesma janela e não faria nada. */}
        {/* Liberar só existe quando o problema é o HORÁRIO (Fase 0). */}
        {status.pendentes > 0 &&
          (status.impedimentoTipo === "horario" || status.impedimentoTipo === "expediente") && (
          <button
            type="button"
            onClick={liberar}
            disabled={liberando}
            className="text-fluid-sm border-alerta-linha text-alerta hover:opacity-80 flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-opacity disabled:opacity-60"
          >
            <Clock className="h-4 w-4" />
            {liberando ? "Liberando…" : "Liberar envio agora"}
          </button>
        )}

        {(status.impedimentoTipo === "desconectado" || status.impedimentoTipo === "sem_numero") && (
          <Link
            href="/corretor/whatsapp"
            className="text-fluid-sm border-alerta-linha text-alerta flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-4 hover:opacity-80"
          >
            Conectar o número
          </Link>
        )}

        {status.pendentes > 0 && !parada && (
          <button
            type="button"
            onClick={empurrar}
            disabled={processando}
            className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-colors disabled:opacity-60"
          >
            <Zap className="h-4 w-4" />
            {processando ? "Enviando…" : "Enviar agora"}
          </button>
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
          apaga mensagens programadas, e não é rotina. O botão "Liberar
          envios de hoje", que zerava a proteção do número, saiu (0155). */}
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
                  disabled={limpando || processando}
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

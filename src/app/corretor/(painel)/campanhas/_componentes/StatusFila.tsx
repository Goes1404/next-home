"use client";

import { useState, useTransition } from "react";
import { Clock, RotateCcw, Trash2, Zap } from "lucide-react";
import {
  liberarEnvioAgora,
  limparFilaDisparo,
  processarFilaAgora,
  resetarCotaDisparo,
  statusDisparo,
  type StatusDisparo,
} from "../acoes";

/**
 * "Como está a fila", em português de gente (roadmap F4).
 *
 * O painel antigo mostrava três números crus — pendentes, cota, próximo
 * envio — mais dois botões perigosos sempre à vista. Cota, fila e instância
 * são vocabulário de quem construiu o sistema; o corretor quer saber se as
 * mensagens estão saindo e quando as outras saem.
 *
 * A proteção anti-ban é explicada como CUIDADO, não como limite: o número é
 * dele, e uma linha bloqueada não volta com deploy.
 */

function frasePrincipal(status: StatusDisparo): string {
  if (status.impedimento) return status.impedimento;
  if (status.pendentes === 0) return "Nenhuma mensagem esperando. Crie uma lista de transmissão abaixo.";

  const saldo = status.saldoHoje;
  if (saldo !== null && saldo < status.pendentes) {
    const restante = status.pendentes - saldo;
    return `Hoje saem ${saldo} mensagem${saldo === 1 ? "" : "s"}; as outras ${restante} continuam amanhã, sozinhas.`;
  }
  return `${status.pendentes} mensagem${status.pendentes === 1 ? "" : "s"} para enviar hoje — saem sozinhas, uma a cada minuto.`;
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [processando, iniciarProcessamento] = useTransition();
  const [limpando, iniciarLimpeza] = useTransition();
  const [resetando, iniciarReset] = useTransition();
  const [liberando, iniciarLiberacao] = useTransition();

  if (!status) return null;

  const parada = Boolean(status.impedimento);

  async function atualizar() {
    setStatus(await statusDisparo());
    await aoMudar?.();
  }

  function empurrar() {
    setErro(null);
    iniciarProcessamento(async () => {
      const resultado = await processarFilaAgora();
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      await atualizar();
      setFeedback(
        resultado.processados === 0
          ? "Nada vencido neste instante — a fila segue no ritmo dela."
          : `${resultado.enviados} mensagem${resultado.enviados === 1 ? "" : "s"} enviada${resultado.enviados === 1 ? "" : "s"} agora.` +
              (resultado.restantes > 0 ? ` Faltam ${resultado.restantes}.` : " Fila zerada."),
      );
      setTimeout(() => setFeedback(null), 8000);
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

    setErro(null);
    iniciarLimpeza(async () => {
      const resultado = await limparFilaDisparo();
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      await atualizar();
      setFeedback(
        resultado.removidos === 0
          ? "A fila já estava vazia."
          : `Fila limpa: ${resultado.removidos} envio(s) removido(s).`,
      );
      setTimeout(() => setFeedback(null), 8000);
    });
  }

  /**
   * TEMPORÁRIO — fase de teste. Ver o aviso em `resetarCotaDisparo`: isto
   * afrouxa a proteção anti-ban de propósito, e o texto da confirmação
   * existe para que ninguém clique sem saber disso.
   */
  function resetarCota() {
    if (
      !confirm(
        "Resetar a cota devolve os disparos do dia e solta qualquer bloqueio.\n\n" +
          "A cota existe para proteger seu número: volume alto num número novo é o " +
          "caminho mais curto para o WhatsApp bloquear a linha. Use só em teste. Confirma?",
      )
    ) {
      return;
    }

    setErro(null);
    iniciarReset(async () => {
      const resultado = await resetarCotaDisparo();
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      await atualizar();
      setFeedback("Cota do dia zerada e bloqueios soltos. A fila volta a andar.");
      setTimeout(() => setFeedback(null), 8000);
    });
  }

  /**
   * Solta a fila que está esperando o horário comercial.
   *
   * Marcar a campanha não basta: os itens já foram gravados com
   * `agendado_para` na próxima janela, e o disparador obedece a hora, não a
   * marca. A ação reagenda tudo a partir de agora — ver `liberarEnvioAgora`.
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

    setErro(null);
    iniciarLiberacao(async () => {
      const resultado = await liberarEnvioAgora();
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      await atualizar();
      setFeedback(
        `Liberado: ${resultado.mensagens} mensagem${resultado.mensagens === 1 ? "" : "s"} saindo agora, uma a cada minuto.` +
          (resultado.retentativas > 0
            ? ` ${resultado.retentativas} que tinha${resultado.retentativas === 1 ? "" : "m"} falhado volta${resultado.retentativas === 1 ? "" : "m"} para a fila.`
            : ""),
      );
      setTimeout(() => setFeedback(null), 10000);
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
        {status.pendentes > 0 && parada && (
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

      {feedback && <p className="text-fluid-xs text-ok mt-3">{feedback}</p>}
      {erro && (
        <p role="alert" className="text-fluid-xs text-alerta mt-3">
          {erro}
        </p>
      )}

      {/* Ferramentas que estragam coisa ficam atrás de uma porta. Limpar a
          fila apaga mensagens programadas; resetar a cota afrouxa a proteção
          anti-ban de propósito. Nenhuma das duas é rotina. */}
      {(status.pendentes > 0 || parada) && (
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

              {/* TEMPORÁRIO — fase de teste. Remover junto com
                  `resetarCotaDisparo` e a função `resetar_cota_campanha`
                  (migration 0034) quando a operação entrar no ritmo real. */}
              <button
                type="button"
                onClick={resetarCota}
                disabled={resetando || processando || limpando}
                title="Fase de teste: devolve os disparos do dia e solta bloqueios. Afrouxa a proteção anti-ban."
                className="text-fluid-xs border-alerta-linha bg-alerta-lavado text-alerta flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 transition-opacity hover:opacity-80 disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {resetando ? "Resetando…" : "Liberar envios de hoje (teste)"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

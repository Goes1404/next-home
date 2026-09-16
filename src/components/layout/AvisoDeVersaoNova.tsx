"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  houveDeploy,
  pareceChunkQueSumiu,
  VERSAO_DA_BUILD,
} from "@/lib/versao/versaoDaBuild";

/**
 * Avisa a aba que já estava aberta que existe uma versão nova.
 *
 * O porquê está inteiro em `lib/versao/versaoDaBuild.ts`: o HTML deste site
 * nunca é cacheado, então quem carrega "a versão antiga" é sempre uma ABA que
 * nunca renavegou. Ela não pede nada ao voltar do segundo plano — e por isso
 * o contorno que a equipe achou (colar o link de novo) funciona: colar o link
 * é uma navegação.
 *
 * Três decisões que definem o comportamento:
 *
 * - **Nunca recarrega sozinho.** Recarregar por conta própria perde o que a
 *   pessoa estava escrevendo — um pedido meio digitado no Estúdio, um filtro
 *   montado na lista. Quem decide o momento é ela; o que faltava era saber.
 * - **Pergunta quando a aba VOLTA**, não de minuto em minuto. É no retorno do
 *   segundo plano que a aba velha é usada, e é o gesto que não custa nada
 *   detectar. O relógio de 15 minutos existe só para a aba que fica aberta na
 *   frente da pessoa o dia inteiro.
 * - **Cala em dúvida.** Rede fora, resposta torta, carimbo ausente: nada é
 *   anunciado (ver `houveDeploy`). Aviso que aparece sem motivo é como um
 *   aviso deixa de ser lido — a régua que este projeto aplica desde o alerta
 *   de evolução da conversa.
 *
 * Mora no layout RAIZ, junto com a onda de transição, porque vale para o site
 * público e para o painel: os dois são servidos pelo mesmo deploy, e o
 * corretor com o painel aberto no celular é justamente quem mais sofre com a
 * aba velha (é lá que a Server Action de outro build devolve 404).
 */

/** Piso entre duas conferências, para o retorno de foco não virar rajada. */
const INTERVALO_MINIMO_MS = 30_000;

/** Folga para o primeiro carregamento terminar antes de qualquer pergunta. */
const ESPERA_INICIAL_MS = 4_000;

/** Relógio da aba que fica visível sem ninguém trocar de janela. */
const RELOGIO_MS = 15 * 60_000;

export function AvisoDeVersaoNova() {
  const [temVersaoNova, setTemVersaoNova] = useState(false);
  const ultimaConferencia = useRef(0);
  const dispensada = useRef(false);

  const conferir = useCallback(async () => {
    // Sem carimbo (desenvolvimento, ou build sem `NEXT_PUBLIC_BUILD_ID`) não
    // há o que comparar: nem vale a requisição.
    if (!VERSAO_DA_BUILD || dispensada.current) return;

    const agora = Date.now();
    if (agora - ultimaConferencia.current < INTERVALO_MINIMO_MS) return;
    ultimaConferencia.current = agora;

    try {
      const r = await fetch("/api/versao", { cache: "no-store" });
      if (!r.ok) return;
      const corpo: unknown = await r.json();
      const doServidor = (corpo as { versao?: unknown } | null)?.versao;
      if (houveDeploy(VERSAO_DA_BUILD, doServidor)) setTemVersaoNova(true);
    } catch {
      // Rede fora não é deploy. Silêncio é a resposta certa.
    }
  }, []);

  useEffect(() => {
    /*
     * A primeira conferência espera, e por duas razões que apontam para o
     * mesmo lugar. A que o lint cobra: chamar isto direto no efeito agenda
     * `setState` dentro da própria renderização, e a regra desta base recusa.
     * A que importa mais: esta é a tela que a pessoa acabou de abrir, e uma
     * requisição disparada junto com a hidratação disputa banda com o
     * conteúdo — a aba que acabou de nascer é, por definição, a que está na
     * versão certa. Quem precisa do aviso é a aba que volta do segundo plano,
     * e essa entra pelo `visibilitychange`.
     */
    const primeira = window.setTimeout(() => void conferir(), ESPERA_INICIAL_MS);

    const aoVoltar = () => {
      if (document.visibilityState === "visible") void conferir();
    };
    const aoRestaurar = () => void conferir();

    /*
     * Chunk que sumiu é a aba velha falhando ALTO — ela pede um arquivo do
     * build anterior e recebe 404. Vale como gatilho para perguntar agora, em
     * vez de esperar o próximo retorno de foco; quem julga se houve deploy
     * continua sendo o servidor.
     */
    const aoErrar = (e: ErrorEvent) => {
      if (pareceChunkQueSumiu(e.error ?? e.message)) {
        ultimaConferencia.current = 0;
        void conferir();
      }
    };
    const aoRejeitar = (e: PromiseRejectionEvent) => {
      if (pareceChunkQueSumiu(e.reason)) {
        ultimaConferencia.current = 0;
        void conferir();
      }
    };

    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("pageshow", aoRestaurar);
    window.addEventListener("error", aoErrar);
    window.addEventListener("unhandledrejection", aoRejeitar);

    const relogio = window.setInterval(() => {
      if (document.visibilityState === "visible") void conferir();
    }, RELOGIO_MS);

    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("pageshow", aoRestaurar);
      window.removeEventListener("error", aoErrar);
      window.removeEventListener("unhandledrejection", aoRejeitar);
      window.clearTimeout(primeira);
      window.clearInterval(relogio);
    };
  }, [conferir]);

  if (!temVersaoNova) return null;

  return (
    /*
     * No TOPO, e a escolha tem custo declarado: a faixa cobre a parte de cima
     * do cabeçalho enquanto está na tela. O rodapé estava ocupado — botão de
     * WhatsApp, voltar ao topo, barra de navegação do painel e a região de
     * avisos, todos em `acima-da-nav` —, e empilhar um quinto elemento ali é
     * como um toque acaba no alvo errado. Sendo raro, dispensável e de uma
     * linha, o topo é o lugar honesto.
     *
     * `fixed` direto no <body>: nenhum ancestral aqui tem `backdrop-filter`,
     * que é a armadilha que este projeto já pisou seis vezes (vidro cria
     * containing block e prende o elemento fixo dentro dele).
     */
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[90] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-brand-500 px-4 py-2.5 text-white shadow-lg"
    >
      <p className="text-sm font-medium">
        O aplicativo foi atualizado. Recarregue para usar a versão nova.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-full bg-white px-5 text-sm font-semibold text-brand-700 transition-transform active:scale-[0.98]"
        >
          Atualizar agora
        </button>
        <button
          type="button"
          onClick={() => {
            dispensada.current = true;
            setTemVersaoNova(false);
          }}
          aria-label="Dispensar o aviso de versão nova"
          className="min-h-11 min-w-11 rounded-full px-3 text-sm text-white/80 hover:text-white"
        >
          Agora não
        </button>
      </div>
    </div>
  );
}

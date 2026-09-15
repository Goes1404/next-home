"use client";

import Link from "next/link";
import { ChatBase } from "./_componentes/ChatBase";
import type { PerguntaDeChat } from "./_componentes/chatTipos";
import { BlocosDaResposta } from "./consultor/BlocosDaResposta";
import type { EstadoDoChatConsultor } from "./consultor/acoes";

const SUGESTOES = [
  "Renda de 8 mil: o que serve?",
  "Até quanto ele fecha?",
  "Resposta pro cliente sumido",
] as const;

/**
 * O painel ABERTO do consultor — separado da bolha (`BalaoConsultor`) para
 * ser carregado por `next/dynamic` só quando alguém toca nela (F4 do
 * roadmap de performance, 13/09/2026).
 *
 * A bolha mora no LAYOUT do painel, ou seja, em toda rota; até aqui ela
 * arrastava o `ChatBase` (410 linhas), os blocos de resposta e o chat do
 * consultor para o JavaScript de toda tela, aberta ou não. Agora a bolha
 * pesa o botão; o resto chega no toque.
 *
 * Estado e envio ficam na bolha, de propósito: fechar e reabrir o painel
 * não pode apagar a conversa em curso.
 */
export function PainelDoConsultor({
  telaCheia,
  fechar,
  estado,
  pendente,
  pensando,
  enviar,
}: {
  telaCheia: string;
  fechar: () => void;
  estado: EstadoDoChatConsultor | null;
  pendente: { id: string; conteudo: string } | null;
  pensando: boolean;
  enviar: (texto: string, escolha?: { perguntaId: string; pergunta: string }) => Promise<void>;
}) {
  return (
    <section
      role="dialog"
      aria-label="Consultor"
      /*
       * Celular: a tela inteira — 380px de painel sobre 360px de tela é o
       * painel inteiro com cara de recorte. Computador: caixa no canto,
       * com teto de altura para nunca encostar no cabeçalho.
       */
      className="bg-fundo pb-safe pointer-events-auto absolute inset-0 flex flex-col md:inset-auto md:pb-0 md:right-6 md:bottom-6 md:h-[min(34rem,calc(100dvh-7rem))] md:w-[23.75rem] md:rounded-2xl md:shadow-2xl"
    >
      <header className="border-linha flex items-center gap-2 border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-titulo text-fluid-sm font-medium">Consultor</p>
          <p className="text-tenue truncate text-[11px]">Estimativas, não proposta oficial</p>
        </div>
        <Link
          href={telaCheia}
          onClick={fechar}
          className="text-acento-suave hover:bg-vidro flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-medium transition-colors"
        >
          Tela cheia
        </Link>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar consultor"
          className="text-tenue hover:text-corpo flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      {/*
        `ChatBase` carrega a própria altura (`h-[72dvh] min-h-[28rem]`),
        que é a medida da TELA CHEIA — dentro de uma caixa de 34rem ela
        sobraria por baixo. Aqui quem manda é o painel, e a sobreposição
        de `>div` vence a classe de altura por especificidade.
        Sem borda e sem raio próprios: a moldura é a do painel.
      */}
      <div className="min-h-0 flex-1 [&>div]:h-full [&>div]:min-h-0 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent">
        <ChatBase
          mensagens={estado?.mensagens ?? []}
          pendente={pendente}
          pensando={pensando}
          placeholder="O que você precisa?"
          sugestoes={SUGESTOES}
          vazio={
            <>
              <p className="text-titulo font-medium">Pergunte como perguntaria a um gerente.</p>
              <p className="mt-1">Ele conhece os imóveis publicados e as regras de crédito.</p>
            </>
          }
          onEnviar={(t) => enviar(t)}
          onEscolher={(p: PerguntaDeChat, escolha) =>
            enviar(escolha, { perguntaId: p.id, pergunta: p.texto })
          }
          renderAbaixo={(m) => <BlocosDaResposta dados={m.dados} />}
        />
      </div>
    </section>
  );
}

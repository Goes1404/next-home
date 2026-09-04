"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MensagemDoEstudio, PerguntaDoEstudio } from "@/lib/estudio/contrato";

/**
 * A casca de chat do Estúdio — balões, composer, rolagem e chips.
 *
 * Extraída do que o Live Chat (`conversas/ConversasClient.tsx`) já fazia bem:
 * rolagem que só acompanha quando a pessoa está presa no fim, envio otimista
 * com rollback, Enter envia e Shift+Enter quebra linha, alvo de 44px. Não
 * substitui o Live Chat — ele fala com CLIENTE por WhatsApp e tem regras
 * próprias (áudio, ack, 👍/👎). Aqui o interlocutor é a IA da casa.
 *
 * O que ela NÃO sabe: o que é uma proposta de arte ou de vídeo. Isso chega
 * por `renderProposta`, para a mesma casca servir aos dois chats sem virar um
 * `if (modo === …)` a cada linha.
 */

export type EnvioPendente = { id: string; conteudo: string };

export function ChatBase({
  mensagens,
  pendente,
  pensando,
  placeholder,
  vazio,
  onEnviar,
  onEscolher,
  renderProposta,
  renderResultado,
}: {
  mensagens: MensagemDoEstudio[];
  /** A fala do corretor ainda não confirmada pelo servidor (otimismo). */
  pendente: EnvioPendente | null;
  /** A IA está "digitando". */
  pensando: boolean;
  placeholder: string;
  /** O que aparece antes da primeira mensagem — o convite. */
  vazio: ReactNode;
  onEnviar: (texto: string) => Promise<void>;
  onEscolher: (pergunta: PerguntaDoEstudio, escolha: string) => Promise<void>;
  renderProposta: (m: MensagemDoEstudio) => ReactNode;
  renderResultado: (m: MensagemDoEstudio) => ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const corpoRef = useRef<HTMLDivElement>(null);
  const presoNoFimRef = useRef(true);

  const ultimaId = mensagens.at(-1)?.id ?? pendente?.id ?? null;

  // Só acompanha se a pessoa já estava no fim: quem rolou para cima está
  // lendo, e puxar a tela por baixo dela é o jeito mais rápido de perder a
  // linha que ela estava lendo.
  useEffect(() => {
    const corpo = corpoRef.current;
    if (corpo && presoNoFimRef.current) corpo.scrollTop = corpo.scrollHeight;
  }, [ultimaId, pensando]);

  const aoRolar = () => {
    const c = corpoRef.current;
    if (!c) return;
    presoNoFimRef.current = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
  };

  const enviar = async () => {
    const t = texto.trim();
    if (!t || pensando) return;
    setTexto("");
    presoNoFimRef.current = true;
    try {
      await onEnviar(t);
    } catch {
      // Quem chamou já avisou; devolve o texto para a pessoa não redigitar.
      setTexto(t);
    }
  };

  // A pergunta cujos chips ainda valem: a última da IA, se nada veio depois.
  const ultima = mensagens.at(-1);
  const perguntaAberta =
    !pendente && !pensando && ultima?.papel === "ia" && ultima.dados?.tipo === "pergunta"
      ? (ultima.dados as PerguntaDoEstudio)
      : null;

  return (
    <div className="border-linha bg-superficie flex h-[72dvh] min-h-[28rem] flex-col overflow-hidden rounded-2xl border">
      <div
        ref={corpoRef}
        onScroll={aoRolar}
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5"
        aria-live="polite"
      >
        {mensagens.length === 0 && !pendente && (
          <div className="text-apoio mx-auto max-w-md py-10 text-center text-sm">{vazio}</div>
        )}

        {mensagens.map((m) => (
          <Balao key={m.id} papel={m.papel}>
            <p className="text-fluid-sm text-corpo whitespace-pre-line">{m.conteudo}</p>
            {m.dados?.tipo === "proposta" && renderProposta(m)}
            {m.dados?.tipo === "resultado" && renderResultado(m)}
          </Balao>
        ))}

        {pendente && (
          <Balao papel="corretor" apagado>
            <p className="text-fluid-sm text-corpo whitespace-pre-line">{pendente.conteudo}</p>
          </Balao>
        )}

        {pensando && (
          <Balao papel="ia">
            <span className="sr-only">A IA está escrevendo</span>
            <span aria-hidden className="flex items-center gap-1 py-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="bg-tenue block h-1.5 w-1.5 animate-bounce rounded-full motion-reduce:animate-none"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
          </Balao>
        )}
      </div>

      {/* Chips da pergunta aberta: responder num toque, sem digitar. */}
      {perguntaAberta && (
        <div className="border-linha flex flex-wrap gap-2 border-t px-3 py-2.5 md:px-5">
          {perguntaAberta.alternativas.map((alt) => (
            <button
              key={alt}
              type="button"
              onClick={() => void onEscolher(perguntaAberta, alt)}
              className="border-acento-linha bg-acento-lavado text-acento-suave hover:bg-acento hover:text-sobre-cor min-h-11 cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors"
            >
              {alt}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="border-linha flex items-end gap-2 border-t px-3 py-3 md:px-5"
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Sua mensagem"
          className="border-linha bg-elevado text-corpo placeholder:text-tenue focus:border-linha-forte max-h-32 min-h-11 w-full resize-none rounded-2xl border px-4 py-2.5 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={pensando || !texto.trim()}
          aria-label="Enviar"
          className="bg-acento hover:bg-acento-hover text-sobre-cor flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
            <path d="M3.4 20.4 20.9 12 3.4 3.6l.01 6.53L15 12 3.41 13.87z" />
          </svg>
        </button>
      </form>
    </div>
  );
}

const ESTILO_BALAO: Record<"corretor" | "ia", string> = {
  corretor: "bg-acento-lavado border-acento-linha ml-auto",
  ia: "bg-elevado border-linha mr-auto",
};

function Balao({
  papel,
  apagado,
  children,
}: {
  papel: "corretor" | "ia";
  apagado?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-fit max-w-[88%] rounded-2xl border px-3.5 py-2.5 md:max-w-[72%]",
        ESTILO_BALAO[papel],
        apagado && "opacity-60",
      )}
    >
      {papel === "ia" && (
        <p className="text-tenue mb-1 text-[10px] font-medium tracking-[0.14em] uppercase">IA da casa</p>
      )}
      {children}
    </div>
  );
}

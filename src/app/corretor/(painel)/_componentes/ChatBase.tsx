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

export type EnvioPendente = { id: string; conteudo: string; previewUrl?: string | null };

/** O anexo escolhido e ainda não enviado — vive no composer, como no ChatGPT. */
export type AnexoDoComposer = { previewUrl: string; nome: string };

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
  anexo,
  onAnexar,
  onRemoverAnexo,
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
  /** Foto escolhida e ainda não enviada; a tela dona decide o upload. */
  anexo?: AnexoDoComposer | null;
  /** Presente = o clipe aparece. A tela dona valida tipo/tamanho e sobe. */
  onAnexar?: (file: File) => void;
  onRemoverAnexo?: () => void;
}) {
  const [texto, setTexto] = useState("");
  const arquivoRef = useRef<HTMLInputElement>(null);
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
    // Com anexo, mandar sem texto vale: "aqui está a foto" já é a mensagem.
    if ((!t && !anexo) || pensando) return;
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
    <div className="cartao flex h-[72dvh] min-h-[28rem] flex-col overflow-hidden">
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
            {m.dados?.tipo === "referencia" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.dados.url}
                alt="Foto de referência anexada"
                className="border-linha mb-1.5 max-h-44 w-auto max-w-full rounded-lg border"
              />
            )}
            <p className="text-fluid-sm text-corpo whitespace-pre-line">{m.conteudo}</p>
            {m.dados?.tipo === "proposta" && renderProposta(m)}
            {m.dados?.tipo === "resultado" && renderResultado(m)}
          </Balao>
        ))}

        {pendente && (
          <Balao papel="corretor" apagado>
            {pendente.previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pendente.previewUrl}
                alt=""
                className="border-linha mb-1.5 max-h-44 w-auto max-w-full rounded-lg border"
              />
            )}
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

      {/* A foto escolhida, antes do envio — dá para tirar sem mandar. */}
      {anexo && (
        <div className="border-linha flex items-center gap-2 border-t px-3 py-2 md:px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={anexo.previewUrl} alt="" className="border-linha h-12 w-12 rounded-lg border object-cover" />
          <span className="text-apoio min-w-0 flex-1 truncate text-xs">{anexo.nome}</span>
          <button
            type="button"
            onClick={onRemoverAnexo}
            aria-label="Remover foto"
            className="text-tenue hover:text-corpo min-h-11 cursor-pointer px-2 text-sm"
          >
            ✕
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
        className="border-linha flex items-end gap-2 border-t px-3 py-3 md:px-5"
      >
        {onAnexar && (
          <>
            <input
              ref={arquivoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onAnexar(f);
                // Permite escolher o MESMO arquivo de novo depois de remover.
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              disabled={pensando}
              aria-label="Anexar foto de referência"
              className="border-linha text-apoio hover:border-linha-forte hover:text-corpo flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path
                  strokeLinecap="round"
                  d="M21 12.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8L13 4.9a3.7 3.7 0 0 1 5.2 5.2l-8.4 8.4a1.9 1.9 0 0 1-2.7-2.7L15 8"
                />
              </svg>
            </button>
          </>
        )}
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
          disabled={pensando || (!texto.trim() && !anexo)}
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

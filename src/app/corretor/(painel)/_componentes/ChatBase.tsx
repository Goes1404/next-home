"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MensagemDeChat, PerguntaDeChat } from "./chatTipos";

/**
 * A casca de chat do painel — balões, composer, rolagem e chips.
 *
 * Extraída do que o Live Chat (`conversas/ConversasClient.tsx`) já fazia bem:
 * rolagem que só acompanha quando a pessoa está presa no fim, envio otimista
 * com rollback, Enter envia e Shift+Enter quebra linha, alvo de 44px. Não
 * substitui o Live Chat — ele fala com CLIENTE por WhatsApp e tem regras
 * próprias (áudio, ack, 👍/👎). Aqui o interlocutor é a IA da casa.
 *
 * ## O que ela NÃO sabe, e por quê
 *
 * Nada de domínio. Ela nasceu servindo só ao Estúdio e conhecia por nome a
 * proposta, o resultado e a foto de referência; quando o consultor
 * imobiliário chegou com outro vocabulário (cartão de imóvel, simulação,
 * texto pronto para o cliente), ficou claro que cada chat novo somaria um
 * `if` aqui dentro.
 *
 * Hoje ela conhece UM tipo de `dados`: `"pergunta"` — porque responder num
 * toque é mecanismo do chat, não do domínio. Todo o resto entra por
 * `renderAcima` (antes do texto do balão) e `renderAbaixo` (depois).
 *
 * O genérico é a MENSAGEM inteira, não só o `dados`: as telas do Estúdio
 * precisam de `imagemId`/`videoJobId` dentro do render, e parametrizar só o
 * vocabulário obrigaria cada uma a um cast de volta — que é o cast que esta
 * generalização veio tirar.
 */

export type EnvioPendente = { id: string; conteudo: string; previewUrls?: string[] };

/** O anexo escolhido e ainda não enviado — vive no composer, como no ChatGPT. */
export type AnexoDoComposer = { previewUrl: string; nome: string };

export function ChatBase<M extends MensagemDeChat>({
  mensagens,
  pendente,
  pensando,
  placeholder,
  vazio,
  sugestoes,
  onEnviar,
  onEscolher,
  textoInicial,
  renderAcima,
  renderAbaixo,
  anexos,
  onAnexar,
  onRemoverAnexo,
}: {
  mensagens: M[];
  /** A fala do corretor ainda não confirmada pelo servidor (otimismo). */
  pendente: EnvioPendente | null;
  /** A IA está "digitando". */
  pensando: boolean;
  /**
   * O convite dentro do campo. **Até 20 caracteres**, e o guarda
   * `naoCortaTexto.test.ts` cobra.
   *
   * O composer é a caixa mais ESTREITA do painel: numa tela de 320px ele
   * perde ~100px para o clipe e o botão de enviar, e sobram 136px de texto
   * — medido no navegador com o CSS de produção.
   * Os três chats nasceram com um exemplo inteiro ali dentro ("Ex.: renda de
   * 8 mil, quer 2 dorm em Barueri — o que serve?") e o corretor lia metade
   * da frase, cortada no meio da palavra — o defeito que o dono do painel
   * relatou em 11/09/2026.
   *
   * Placeholder de campo de uma linha não quebra: o que não cabe some. O
   * exemplo longo tem lugar próprio, e melhor — os chips de `sugestoes`, que
   * cabem em duas linhas, mandam com um toque e ensinam o formato.
   */
  placeholder: string;
  /** O que aparece antes da primeira mensagem — o convite. */
  vazio: ReactNode;
  /**
   * Pedidos prontos, mostrados ENQUANTO a conversa está vazia.
   *
   * O campo em branco é o problema real destas telas: quem nunca escreveu
   * um pedido de imagem não sabe o que cabe ali, e o cursor piscando não
   * ensina. Cada chip é um pedido de verdade, que preenche o campo e manda
   * — a pessoa vê a IA responder e aprende o formato pelo exemplo.
   *
   * Somem depois da primeira mensagem: aí a conversa já tem assunto e eles
   * competiriam com ela.
   */
  sugestoes?: readonly string[];
  onEnviar: (texto: string) => Promise<void>;
  onEscolher: (pergunta: PerguntaDeChat, escolha: string) => Promise<void>;
  /**
   * O composer nasce com este texto — quem chegou de outra tela trazendo uma
   * pergunta pronta. Fica EDITÁVEL de propósito: mandar sozinho gastaria uma
   * chamada que ninguém confirmou, e a pergunta do cliente quase sempre
   * precisa de um ajuste antes de virar a pergunta do corretor.
   */
  textoInicial?: string;
  /** Desenhado ANTES do texto do balão — a foto de referência do Estúdio. */
  renderAcima?: (m: M) => ReactNode;
  /** Desenhado DEPOIS do texto — proposta, resultado, cartão, simulação. */
  renderAbaixo?: (m: M) => ReactNode;
  /** Foto escolhida e ainda não enviada; a tela dona decide o upload. */
  anexos?: AnexoDoComposer[];
  /** Presente = o clipe aparece. A tela dona valida tipo/tamanho e sobe. */
  onAnexar?: (files: File[]) => void;
  onRemoverAnexo?: (indice: number) => void;
}) {
  const [texto, setTexto] = useState(textoInicial ?? "");

  /*
   * `textoInicial` também vale DEPOIS da montagem.
   *
   * Ele nasceu para quem chega de outra tela com a pergunta pronta, e por isso
   * só era lido uma vez. Desde 10/09 o histórico do Estúdio reaproveita um
   * prompt com o chat já aberto — sem isto, o campo não mudaria e o botão
   * pareceria quebrado.
   *
   * O ajuste acontece DURANTE o render, comparando com o valor anterior, e não
   * num efeito: `setState` síncrono dentro de efeito dispara um segundo render
   * com a tela já pintada (o React avisa disso). Comparar aqui reaproveita o
   * mesmo render. Só sobrescreve com valor não vazio, senão a prop apagaria o
   * que a pessoa está digitando.
   */
  const [inicialAnterior, setInicialAnterior] = useState(textoInicial ?? "");
  if (textoInicial && textoInicial !== inicialAnterior) {
    setInicialAnterior(textoInicial);
    setTexto(textoInicial);
  }
  const arquivoRef = useRef<HTMLInputElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const presoNoFimRef = useRef(true);

  /*
   * O campo cresce com o texto, até o teto de `max-h-32` (8 linhas).
   *
   * Com `rows={1}` fixo, escrever três linhas no celular significava redigir
   * às cegas: só a última ficava visível, e reler antes de mandar exigia
   * rolar dentro de uma caixa de 44px. Zerar a altura antes de ler
   * `scrollHeight` é o que permite ENCOLHER de volta — sem isso a caixa só
   * cresce, e apagar o texto deixa um vão.
   */
  useEffect(() => {
    const campo = campoRef.current;
    if (!campo) return;
    campo.style.height = "0px";
    campo.style.height = `${campo.scrollHeight}px`;
  }, [texto]);

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

  /**
   * Manda o que está no campo — ou o texto que vier por parâmetro, que é
   * como os chips de sugestão entram sem passar pelo `textarea`.
   */
  const enviar = async (textoPronto?: string) => {
    const t = (textoPronto ?? texto).trim();
    // Com anexo, mandar sem texto vale: "aqui está a foto" já é a mensagem.
    if ((!t && (!anexos || anexos.length === 0)) || pensando) return;
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
      ? (ultima.dados as unknown as PerguntaDeChat)
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
          <div className="mx-auto max-w-md py-10">
            <div className="text-apoio text-center text-sm">{vazio}</div>
            {sugestoes && sugestoes.length > 0 && (
              <div className="mt-6">
                <p className="text-tenue mb-2 text-center text-xs">Ou comece por um destes:</p>
                <ul className="flex flex-wrap justify-center gap-2">
                  {sugestoes.map((sugestao) => (
                    <li key={sugestao}>
                      <button
                        type="button"
                        disabled={pensando}
                        onClick={() => void enviar(sugestao)}
                        className="border-linha text-corpo hover:border-acento-linha hover:text-titulo hover:bg-vidro min-h-9 cursor-pointer rounded-full border px-3.5 py-1.5 text-left text-xs break-words transition-colors disabled:opacity-60"
                      >
                        {sugestao}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {mensagens.map((m) => (
          <Balao key={m.id} papel={m.papel}>
            {renderAcima?.(m)}
            <p className="text-fluid-sm text-corpo break-words whitespace-pre-line">{m.conteudo}</p>
            {renderAbaixo?.(m)}
          </Balao>
        ))}

        {pendente && (
          <Balao papel="corretor" apagado>
            {pendente.previewUrls && pendente.previewUrls.length > 0 && (
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {pendente.previewUrls.map((previewUrl) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={previewUrl}
                    src={previewUrl}
                    alt=""
                    className="border-linha max-h-24 w-auto max-w-full rounded-lg border"
                  />
                ))}
              </div>
            )}
            <p className="text-fluid-sm text-corpo break-words whitespace-pre-line">{pendente.conteudo}</p>
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
      {anexos && anexos.length > 0 && (
        <div className="border-linha flex items-center gap-2 border-t px-3 py-2 md:px-5">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {anexos.map((anexo, indice) => (
              <div key={anexo.previewUrl} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={anexo.previewUrl} alt={anexo.nome} className="border-linha h-12 w-12 rounded-lg border object-cover" />
                <button
                  type="button"
                  onClick={() => onRemoverAnexo?.(indice)}
                  aria-label={`Remover ${anexo.nome}`}
                  className="bg-fundo text-corpo absolute -top-2 -right-2 flex size-5 cursor-pointer items-center justify-center rounded-full border text-xs"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
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
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length > 0) onAnexar(files);
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
          ref={campoRef}
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
          className="border-linha bg-elevado text-corpo placeholder:text-tenue focus:border-acento-linha max-h-32 min-h-11 w-full min-w-0 resize-none overflow-y-auto rounded-2xl border px-4 py-2.5 text-sm transition-colors outline-none"
        />
        <button
          type="submit"
          disabled={pensando || (!texto.trim() && (!anexos || anexos.length === 0))}
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
        /*
         * `min-w-0` + `break-words` (09/09/2026): `whitespace-pre-line`
         * preserva a quebra de linha mas NÃO quebra dentro da palavra. Uma
         * URL, um slug ou um nome comprido esticava o balão além do
         * `max-w-[88%]` e o texto saía cortado pela borda do chat — no
         * celular, onde 88% são ~310px, isso acontece com qualquer link.
         */
        "w-fit max-w-[88%] min-w-0 rounded-2xl border px-3.5 py-2.5 break-words md:max-w-[72%]",
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

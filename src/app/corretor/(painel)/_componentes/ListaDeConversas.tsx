"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { quandoCurto } from "@/lib/quando";
import type { ConversaDeChat } from "./chatTipos";

/** Quantas conversas o celular mostra antes do "ver todas". */
const TETO_NO_CELULAR = 4;

/**
 * As conversas salvas de um chat do painel — a lateral no computador, uma
 * lista enxuta no celular.
 *
 * Serve ao Estúdio e ao consultor: lê `ConversaDeChat` (id, título, quando),
 * o mínimo que uma lista precisa. `ConversaDoEstudio` tem `tipo` a mais e
 * continua atribuível.
 *
 * Existe porque o histórico é salvo (decisão de 04/09/2026), e dado gravado
 * sem tela é indistinguível de dado perdido. Ordenada por `atualizado_em`,
 * que toda mensagem sobe.
 *
 * ## A refação de 11/09/2026
 *
 * O dono do painel pediu que o histórico ficasse "visivelmente melhor". O que
 * ele tinha de errado, em ordem de estrago:
 *
 * 1. **Não dizia QUANDO.** `atualizadoEm` chegava do banco e não era
 *    desenhado. Vinte títulos parecidos, todos com o mesmo peso, e nenhuma
 *    pista de qual era a de ontem — o jeito de achar uma conversa era abrir
 *    uma por uma. Agora cada linha traz `quandoCurto`.
 * 2. **No celular eram pastilhas que quebravam linha**, cada uma com um
 *    pedaço de título cortado em `max-w-[70vw]`: um mosaico irregular de
 *    reticências, que é o oposto de uma lista para escolher. Agora é lista de
 *    verdade nos dois tamanhos, com teto de {@link TETO_NO_CELULAR} e "ver
 *    todas" — o histórico não pode empurrar a conversa para fora da tela.
 * 3. **O × de apagar ficava sempre aceso**, do mesmo tamanho do título, em
 *    toda linha. Ação destrutiva competindo com a ação principal. Agora ele
 *    aparece no ponteiro ou no foco (computador) e continua permanente no
 *    toque, onde não existe hover — e pede confirmação.
 *
 * Nunca rola de lado (naoRolaDeLado.test.ts).
 */
export function ListaDeConversas({
  conversas,
  ativa,
  onAbrir,
  onNova,
  onExcluir,
}: {
  conversas: ConversaDeChat[];
  ativa: string | null;
  onAbrir: (id: string) => void;
  onNova: () => void;
  onExcluir: (id: string) => void | Promise<void>;
}) {
  const [tudo, setTudo] = useState(false);
  const visiveis = tudo ? conversas : conversas.slice(0, TETO_NO_CELULAR);
  const escondidas = conversas.length - visiveis.length;

  return (
    /*
     * No celular a lista vem DEPOIS do chat (`order-2`): medido no render de
     * 360px, ela ocupava ~380px acima da conversa, e quem abre a tela no
     * telefone veio conversar, não folhear histórico. No computador é lateral.
     */
    <aside aria-label="Conversas salvas" className="order-2 min-w-0 space-y-2 md:order-none">
      <button
        type="button"
        onClick={onNova}
        className={cn(
          "border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm transition-colors",
          ativa === null && "border-acento-linha bg-acento-lavado text-acento-suave font-medium",
        )}
      >
        <span aria-hidden className="text-lg leading-none">+</span>
        Nova conversa
      </button>

      {conversas.length > 0 && (
        <div className="border-linha bg-superficie/40 rounded-xl border p-1.5">
          <p className="text-tenue px-2 pt-1 pb-1.5 text-[10px] font-medium tracking-[0.14em] uppercase">
            Histórico · {conversas.length}
          </p>

          <ul className="space-y-0.5">
            {visiveis.map((c) => {
              const aberta = ativa === c.id;
              return (
                <li key={c.id} className="group relative flex min-w-0 items-center">
                  <button
                    type="button"
                    onClick={() => onAbrir(c.id)}
                    aria-current={aberta ? "true" : undefined}
                    title={c.titulo}
                    className={cn(
                      // `pr-9` reserva a faixa do × : sem ela o título passa
                      // por baixo do botão e o fim some sob o ícone.
                      "min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg py-1.5 pr-9 pl-2.5 text-left transition-colors",
                      aberta
                        ? "bg-acento-lavado text-acento-suave"
                        : "text-apoio hover:bg-vidro hover:text-titulo",
                    )}
                  >
                    {/* `block` + `truncate`: em elemento de bloco o truncate
                        tira a largura do pai e corta com "…" de verdade — num
                        inline ele empurraria o irmão para fora (naoCortaTexto). */}
                    <span className={cn("block truncate text-sm", aberta && "font-medium")}>
                      {c.titulo}
                    </span>
                    <span className="text-tenue block text-[11px] tabular-nums">
                      {quandoCurto(c.atualizadoEm)}
                    </span>
                  </button>

                  <BotaoApagar titulo={c.titulo} onExcluir={() => void onExcluir(c.id)} />
                </li>
              );
            })}
          </ul>

          {escondidas > 0 && (
            <button
              type="button"
              onClick={() => setTudo(true)}
              className="text-apoio hover:text-titulo min-h-11 w-full cursor-pointer rounded-lg px-2 text-left text-xs transition-colors"
            >
              Ver todas ({conversas.length})
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

/**
 * O × de apagar, em dois toques.
 *
 * Apagar conversa não tem desfazer — o servidor remove a linha. Um toque só,
 * num alvo grudado no título, apagava a conversa errada com facilidade
 * (`min-h-11` deixa os dois alvos colados). O primeiro toque troca o ícone
 * por "Apagar?" em vermelho; o segundo executa.
 *
 * Fica oculto até o ponteiro ou o foco chegarem, mas SEMPRE visível no toque
 * (`group-hover` não existe no celular): `opacity-100 md:opacity-0` é o que
 * dá as duas coisas sem duplicar o botão.
 */
function BotaoApagar({ titulo, onExcluir }: { titulo: string; onExcluir: () => void }) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <span className="absolute right-1 flex items-center gap-1">
        <button
          type="button"
          onClick={onExcluir}
          className="text-perigo border-perigo/40 hover:bg-perigo/10 cursor-pointer rounded-md border px-2 py-1 text-[11px] font-medium"
        >
          Apagar?
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          aria-label="Cancelar"
          className="text-tenue hover:text-corpo cursor-pointer px-1 text-xs"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirmando(true)}
      aria-label={`Apagar conversa "${titulo}"`}
      className="text-tenue hover:text-perigo absolute right-1 grid size-8 cursor-pointer place-items-center rounded-lg text-base opacity-100 transition group-focus-within:opacity-100 group-hover:opacity-100 md:opacity-0"
    >
      ×
    </button>
  );
}

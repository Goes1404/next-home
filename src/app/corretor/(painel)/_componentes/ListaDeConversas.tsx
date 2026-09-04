"use client";

import { cn } from "@/lib/utils";
import type { ConversaDoEstudio } from "@/lib/estudio/contrato";

/**
 * As conversas salvas do Estúdio — a lateral no computador, uma fileira que
 * quebra linha no celular.
 *
 * Existe porque o histórico é salvo (decisão de 04/09/2026), e dado gravado
 * sem tela é indistinguível de dado perdido. Ordenada por `atualizado_em`,
 * que toda mensagem sobe.
 *
 * Nunca rola de lado: `flex-wrap` no celular (naoRolaDeLado.test.ts).
 */
export function ListaDeConversas({
  conversas,
  ativa,
  onAbrir,
  onNova,
  onExcluir,
}: {
  conversas: ConversaDoEstudio[];
  ativa: string | null;
  onAbrir: (id: string) => void;
  onNova: () => void;
  onExcluir: (id: string) => void | Promise<void>;
}) {
  return (
    /*
     * No celular a lista vem DEPOIS do chat (`order-2`): medido no render de
     * 360px, ela ocupava ~380px acima da conversa, e quem abre a tela no
     * telefone veio conversar, não folhear histórico. No computador é lateral.
     */
    <aside aria-label="Conversas salvas" className="order-2 space-y-2 md:order-none">
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
        <ul className="flex flex-wrap gap-1.5 md:block md:space-y-0.5">
          {/* `max-w-full` no item: numa fileira que quebra linha ele não tem largura
              imposta, e sem teto o título longo define a dele — 5px de vazamento
              medidos em 320/360px. É o `min-width: auto` do item de flex/grid, a
              mesma armadilha do link de indicação no hub de Marketing. */}
          {conversas.map((c) => (
            <li key={c.id} className="group flex max-w-full min-w-0 items-stretch md:w-full">
              <button
                type="button"
                onClick={() => onAbrir(c.id)}
                aria-current={ativa === c.id ? "true" : undefined}
                title={c.titulo}
                className={cn(
                  "max-w-[70vw] min-h-11 min-w-0 cursor-pointer truncate rounded-xl px-3 text-left text-sm transition-colors md:max-w-none md:flex-1",
                  ativa === c.id
                    ? "bg-acento-lavado text-acento-suave font-medium"
                    : "text-apoio hover:bg-vidro hover:text-titulo",
                )}
              >
                {c.titulo}
              </button>
              <button
                type="button"
                onClick={() => void onExcluir(c.id)}
                aria-label={`Apagar conversa "${c.titulo}"`}
                className="text-tenue hover:text-perigo grid w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-base transition-colors"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

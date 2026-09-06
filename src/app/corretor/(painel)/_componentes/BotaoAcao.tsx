"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAvisos } from "./Avisos";

/**
 * O botão que executa uma Server Action e conta o que aconteceu.
 *
 * Este padrão estava copiado em cerca de trinta componentes do painel, sempre
 * igual: `useTransition` + `useState<string | null>(erro)` + `router.refresh()`
 * + um `<p role="alert">` desenhado à mão logo abaixo. Copiado trinta vezes,
 * ele divergia trinta vezes — uns mostravam "Salvando…", outros não; uns
 * desabilitavam o botão durante a espera, outros deixavam clicar de novo; e
 * quase nenhum dizia que tinha dado certo.
 *
 * As actions do painel já convergiram para um contrato só (`{ ok?, erro? }`),
 * então dá para ter um componente que o entende:
 *
 *   <BotaoAcao acao={() => moverEtapa(id, "fechado")} sucesso="Lead fechado">
 *     Fechou negócio
 *   </BotaoAcao>
 *
 * O que ele garante e a cópia manual não garantia: alvo de toque de 44px,
 * `aria-busy` durante a espera, clique bloqueado enquanto roda (dois toques
 * numa conexão ruim é o jeito mais fácil de disparar a mesma ação duas
 * vezes), e o erro indo para a região de avisos em vez de um parágrafo que
 * pode estar fora da tela.
 */

export type ResultadoDeAcao = { ok?: boolean | string; erro?: string } | void;

export function BotaoAcao({
  acao,
  sucesso,
  children,
  rotulopendente,
  className,
  variante = "primario",
  atualizar = true,
  confirmar,
  ...resto
}: {
  /** A Server Action. Devolver `{ erro }` vira aviso; o resto é sucesso. */
  acao: () => Promise<ResultadoDeAcao>;
  /**
   * Texto do aviso de sucesso. Omitido de propósito quando o resultado já
   * aparece na tela — anunciar o óbvio é como um aviso deixa de ser lido.
   */
  sucesso?: string;
  children: React.ReactNode;
  /** O que o botão diz enquanto espera. Sem isto, ele diz a mesma coisa. */
  rotulopendente?: string;
  className?: string;
  variante?: "primario" | "secundario" | "perigo";
  /** `router.refresh()` ao terminar. Desligue quando a tela já é otimista. */
  atualizar?: boolean;
  /** Pergunta antes de executar. Para o que não tem desfazer. */
  confirmar?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pendente || resto.disabled}
      aria-busy={pendente}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        iniciar(async () => {
          try {
            const r = await acao();
            if (r && "erro" in r && r.erro) {
              falhar(r.erro);
              return;
            }
            if (sucesso) avisar(sucesso);
            if (atualizar) router.refresh();
          } catch {
            // Erro de rede não devolve `{ erro }` — devolve exceção. Sem este
            // ramo o botão destrava e a tela não diz nada, que é o pior
            // desfecho: parece que a ação foi feita.
            falhar("Não deu para completar. Confira a conexão e tente de novo.");
          }
        });
      }}
      className={cn(
        "text-fluid-sm inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 font-medium transition-all",
        "disabled:cursor-wait disabled:opacity-60",
        VARIANTE[variante],
        className,
      )}
      {...resto}
    >
      {pendente && <Girinha />}
      {pendente && rotulopendente ? rotulopendente : children}
    </button>
  );
}

const VARIANTE = {
  primario: "bg-acento text-sobre-cor hover:bg-acento-hover",
  secundario: "border-linha text-corpo hover:border-acento-linha hover:text-titulo border",
  perigo: "border-perigo-linha text-perigo hover:bg-perigo-lavado border",
} as const;

/**
 * O indicador de espera. Não existia nenhum no painel — a única pista de que
 * algo estava acontecendo era o texto do botão trocar, quando trocava.
 *
 * Some para quem pediu menos movimento: `animate-spin` é rotação contínua, o
 * caso de manual de `prefers-reduced-motion`. Aí o `aria-busy` e o rótulo
 * pendente seguram a informação sozinhos.
 */
function Girinha() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-4 w-4 shrink-0 animate-spin motion-reduce:hidden"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

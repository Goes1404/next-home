"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { Observer } from "gsap/Observer";
import type { Midia } from "@/lib/types";

/*
 * ILHA ESCURA — este arquivo não usa os tokens de tema, e é a única exceção
 * de arquivo inteiro.
 *
 * Um visualizador de foto é escuro em qualquer tema: a tela apaga em volta
 * para a imagem ser a única coisa acesa. Como a superfície aqui nunca clareia,
 * a cor dos controles por cima dela também não pode acompanhar o tema da
 * página — `text-titulo` num tema claro pintaria de escuro um texto que vive
 * sobre um véu quase preto.
 */

/** Distância mínima em px para um arrasto contar como troca de imagem. */
const LIMIAR_SWIPE = 50;

const semInscricao = () => () => {};

/**
 * `false` no servidor e na primeira pintura, `true` depois de hidratar.
 * Usa `useSyncExternalStore` em vez de um `setState` em efeito porque o
 * portal precisa de `document`, que não existe durante o SSR.
 */
function useMontado(): boolean {
  return useSyncExternalStore(
    semInscricao,
    () => true,
    () => false,
  );
}

export type LightboxProps = {
  itens: Midia[];
  /**
   * Miniatura de onde a imagem "saiu". Com ela, abrir o lightbox deixa de ser
   * um corte: a foto do mosaico VOA da própria posição até a tela cheia e
   * volta ao fechar — continuidade espacial (shared element).
   */
  origem?: HTMLElement | null;
  /** Índice aberto; `null` mantém o lightbox fechado. */
  indice: number | null;
  aoFechar: () => void;
  aoTrocar: (indice: number) => void;
  /** Rótulo do conjunto, lido por leitores de tela ("Galeria", "Plantas"...). */
  rotulo?: string;
};

/**
 * Visualizador em tela cheia, compartilhado pela galeria de fotos e pelas
 * plantas.
 *
 * Renderiza num portal para `document.body` por um motivo concreto: o
 * overlay é `position: fixed`, e qualquer ancestral com `transform` viraria
 * o containing block dele — que é exatamente o que o `<Reveal>` faz ao
 * animar com GSAP (o transform continua aplicado mesmo depois de resolver
 * em 0,0). Com o portal, o lightbox pode ser usado de dentro de qualquer
 * componente sem que a árvore acima importe.
 */
export function Lightbox({
  itens,
  indice,
  aoFechar,
  aoTrocar,
  rotulo = "Galeria",
  origem = null,
}: LightboxProps) {
  const montado = useMontado();
  const fecharRef = useRef<HTMLButtonElement>(null);
  const palcoRef = useRef<HTMLDivElement>(null);
  const fundoRef = useRef<HTMLDivElement>(null);
  const toqueX = useRef<number | null>(null);
  // Devolve o foco a quem abriu o lightbox — sem isso o leitor de tela e o
  // teclado voltam para o topo do documento ao fechar.
  const origemFoco = useRef<HTMLElement | null>(null);

  const aberto = indice !== null && itens.length > 0;

  const anterior = useCallback(() => {
    if (indice === null) return;
    aoTrocar((indice - 1 + itens.length) % itens.length);
  }, [indice, itens.length, aoTrocar]);

  const proxima = useCallback(() => {
    if (indice === null) return;
    aoTrocar((indice + 1) % itens.length);
  }, [indice, itens.length, aoTrocar]);

  useEffect(() => {
    if (!aberto) return;

    origemFoco.current = document.activeElement as HTMLElement | null;
    fecharRef.current?.focus();

    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") aoFechar();
      if (ev.key === "ArrowLeft") anterior();
      if (ev.key === "ArrowRight") proxima();
    };

    window.addEventListener("keydown", aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      origemFoco.current?.focus();
    };
  }, [aberto, aoFechar, anterior, proxima]);

  /**
   * Abertura como ELEMENTO COMPARTILHADO e arrastar-para-dispensar.
   *
   * Feito com Flip e Observer do GSAP, e não com uma biblioteca de motion
   * nova: o GSAP já é o motor da casa, e somar outro runtime de animação
   * pesaria justamente no celular, que acabou de perder 14,8 MB de vídeo. O
   * Flip é a ferramenta canônica para isto — mede o estado inicial (a
   * miniatura), deixa o React pintar o final (tela cheia) e interpola a
   * diferença com transform puro.
   */
  useEffect(() => {
    if (!aberto) return;
    const palco = palcoRef.current;
    const fundo = fundoRef.current;
    if (!palco) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(Flip, Observer);
    let observador: Observer | null = null;

    const contexto = gsap.context(() => {
      if (origem) {
        // Miniatura e palco são nós DIFERENTES, então não basta capturar o
        // estado de um e animar o outro (o Flip só casa elementos iguais ou
        // com o mesmo data-flip-id). O caminho é: encaixar o palco em cima da
        // miniatura, fotografar esse encaixe, devolver o palco ao tamanho
        // natural e animar de volta a partir da foto.
        Flip.fit(palco, origem, { scale: true });
        const estado = Flip.getState(palco);
        gsap.set(palco, { clearProps: "transform,width,height,top,left" });
        Flip.from(estado, {
          duration: 0.62,
          ease: "power3.inOut",
          scale: true,
        });
      } else {
        gsap.from(palco, { scale: 0.92, autoAlpha: 0, duration: 0.4, ease: "power2.out" });
      }

      if (fundo) gsap.from(fundo, { autoAlpha: 0, duration: 0.35 });

      // Arrastar para dispensar: a foto acompanha o dedo e some se o gesto
      // for decidido. Só no eixo Y — o X já é a troca de imagem por swipe.
      observador = Observer.create({
        target: palco,
        type: "touch,pointer",
        dragMinimum: 8,
        tolerance: 12,
        onDrag: (self) => {
          const dy = self.deltaY + (gsap.getProperty(palco, "y") as number);
          gsap.set(palco, { y: dy, scale: 1 - Math.min(Math.abs(dy) / 1400, 0.14) });
          if (fundo) gsap.set(fundo, { opacity: 1 - Math.min(Math.abs(dy) / 700, 0.55) });
        },
        onDragEnd: () => {
          const dy = gsap.getProperty(palco, "y") as number;
          if (Math.abs(dy) > 130) {
            aoFechar();
            return;
          }
          // Não passou do limiar: volta com mola, o gesto foi uma hesitação.
          gsap.to(palco, { y: 0, scale: 1, duration: 0.5, ease: "elastic.out(1, 0.7)" });
          if (fundo) gsap.to(fundo, { opacity: 1, duration: 0.3 });
        },
      });
    });

    return () => {
      observador?.kill();
      contexto.revert();
    };
    // `indice` fora das deps de propósito: trocar de foto dentro do lightbox
    // não é uma nova abertura, e refazer o Flip a cada seta daria um salto.
  }, [aberto, origem, aoFechar]);

  if (!montado || !aberto) return null;

  const atual = itens[indice];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={rotulo}
      ref={fundoRef}
      // `bg-ink-950/92` + desfoque: o fundo fosco deixa a página entrever-se
      // atrás da foto, o que dá profundidade e reforça que o lightbox é uma
      // camada — antes era um preto de 98% que apagava o contexto.
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-950/92 p-4 backdrop-blur-xl"
      onClick={aoFechar}
      onTouchStart={(ev) => {
        toqueX.current = ev.touches[0].clientX;
      }}
      onTouchEnd={(ev) => {
        if (toqueX.current === null) return;
        const delta = ev.changedTouches[0].clientX - toqueX.current;
        if (Math.abs(delta) > LIMIAR_SWIPE) {
          if (delta > 0) anterior();
          else proxima();
        }
        toqueX.current = null;
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
        <span className="text-fluid-sm rounded-full bg-white/10 px-3.5 py-1.5 font-medium text-mist-100 tabular-nums">
          {indice + 1} de {itens.length}
        </span>
        <button
          ref={fecharRef}
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-mist-50 transition-colors hover:bg-white/20"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {itens.length > 1 && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            anterior();
          }}
          aria-label="Imagem anterior"
          className="absolute left-2 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-mist-50 transition-colors hover:bg-white/20 sm:flex sm:left-6"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}

      <div
        ref={palcoRef}
        className="relative h-[75vh] w-full max-w-4xl touch-none"
        onClick={(ev) => ev.stopPropagation()}
      >
        <Image
          src={atual.url}
          alt={atual.alt}
          fill
          sizes="(min-width: 896px) 896px, 100vw"
          className="object-contain"
          placeholder={atual.blurDataUrl ? "blur" : "empty"}
          blurDataURL={atual.blurDataUrl ?? undefined}
          priority
        />
      </div>

      {itens.length > 1 && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            proxima();
          }}
          aria-label="Próxima imagem"
          className="absolute right-2 z-10 hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 text-mist-50 transition-colors hover:bg-white/20 sm:flex sm:right-6"
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {atual.alt && (
        <p className="text-fluid-sm absolute inset-x-0 bottom-0 px-6 pb-5 text-center text-mist-300">
          {atual.alt}
        </p>
      )}
    </div>,
    document.body,
  );
}

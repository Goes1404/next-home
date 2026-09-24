"use client";

import { useEffect } from "react";

/**
 * Faz o painel reagir ao PONTEIRO, em dois lugares:
 *
 * - no cartão sob o ponteiro, escreve ONDE ele está (`--luz-x`, `--luz-y`);
 *   o `::before` de `cartao` e `cartao-heroi` desenha ali um foco suave na
 *   cor do módulo (ver `globals.css`);
 * - na aurora do fundo (`.painel-aurora`), escreve a posição normalizada
 *   (`--lean-x`, `--lean-y`, de -0,5 a 0,5); o CSS inclina o conjunto
 *   ±1,2vw na direção da mão, com transição longa.
 *
 * Custo: UM listener passivo no documento e, por quadro, no máximo uma
 * leitura de layout (`getBoundingClientRect` do cartão) e quatro escritas de
 * custom property — tudo agrupado em `requestAnimationFrame`. Só existe onde
 * há ponteiro fino e hover: no celular não monta nada, porque não haveria o
 * que seguir.
 *
 * Renderiza nada: é só o efeito.
 */
export function LuzDosCartoes() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let alvo: HTMLElement | null = null;
    let aurora: HTMLElement | null = null;
    let x = 0;
    let y = 0;
    let quadro = 0;

    const aplicar = () => {
      quadro = 0;
      aurora ??= document.querySelector<HTMLElement>(".painel-aurora");
      if (aurora) {
        aurora.style.setProperty("--lean-x", (x / window.innerWidth - 0.5).toFixed(3));
        aurora.style.setProperty("--lean-y", (y / window.innerHeight - 0.5).toFixed(3));
      }
      if (!alvo) return;
      const r = alvo.getBoundingClientRect();
      alvo.style.setProperty("--luz-x", `${Math.round(x - r.left)}px`);
      alvo.style.setProperty("--luz-y", `${Math.round(y - r.top)}px`);
    };

    const mover = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      alvo = (e.target as Element | null)?.closest<HTMLElement>(".cartao, .cartao-heroi") ?? null;
      if (!quadro) quadro = requestAnimationFrame(aplicar);
    };

    document.addEventListener("pointermove", mover, { passive: true });
    return () => {
      document.removeEventListener("pointermove", mover);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, []);

  return null;
}

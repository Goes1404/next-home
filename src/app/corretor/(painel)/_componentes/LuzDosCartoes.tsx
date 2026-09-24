"use client";

import { useEffect } from "react";

/**
 * No cartão sob o ponteiro, escreve ONDE ele está (`--luz-x`, `--luz-y`); o
 * `::before` de `cartao` e `cartao-heroi` desenha ali um foco suave na cor
 * do módulo (ver `globals.css`). A aurora do fundo NÃO segue mais o mouse:
 * ver o incidente de 24/09 no comentário dela.
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
    let x = 0;
    let y = 0;
    let quadro = 0;

    const aplicar = () => {
      quadro = 0;
      if (!alvo) return;
      const r = alvo.getBoundingClientRect();
      alvo.style.setProperty("--luz-x", `${Math.round(x - r.left)}px`);
      alvo.style.setProperty("--luz-y", `${Math.round(y - r.top)}px`);
    };

    const mover = (e: PointerEvent) => {
      alvo = (e.target as Element | null)?.closest<HTMLElement>(".cartao, .cartao-heroi") ?? null;
      if (!alvo) return;
      x = e.clientX;
      y = e.clientY;
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

"use client";

import { useEffect, useRef } from "react";

/**
 * Profundidade pelo ponteiro no herói da home, SÓ no computador (03/10/2026).
 *
 * Escreve `--ponteiro-x` e `--ponteiro-y` (de -1 a 1) na seção do herói, e os
 * cards do mosaico os consomem pela propriedade `translate` com pesos
 * diferentes: o que anda mais parece mais perto. A foto do fundo anda ao
 * contrário e pouco, que é o que se lê como "lá atrás".
 *
 * Três regras, as três desta base:
 *
 * - `translate`, nunca `transform`: o `transform` já tem dono (as camadas de
 *   rolagem e a chegada do herói), e dois donos da mesma propriedade se
 *   sobrescrevem. As duas propriedades se compõem.
 * - Nada roda parado: o laço só existe enquanto o valor ainda está chegando
 *   no alvo. Com o mouse quieto, zero quadros.
 * - Mouse de verdade só (`hover` + `pointer: fine`), e nada para quem pediu
 *   menos movimento. No toque o parallax é só o da rolagem.
 */
export function ProfundidadeDoPonteiro() {
  const medidor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const secao = medidor.current?.parentElement;
    if (!secao) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const foto = document.querySelector<HTMLElement>("[data-fundo-camada]");
    const alvo = { x: 0, y: 0 };
    const atual = { x: 0, y: 0 };
    let quadro = 0;

    const passo = () => {
      atual.x += (alvo.x - atual.x) * 0.08;
      atual.y += (alvo.y - atual.y) * 0.08;
      const parado = Math.abs(alvo.x - atual.x) < 0.001 && Math.abs(alvo.y - atual.y) < 0.001;
      if (parado) {
        atual.x = alvo.x;
        atual.y = alvo.y;
      }
      secao.style.setProperty("--ponteiro-x", atual.x.toFixed(4));
      secao.style.setProperty("--ponteiro-y", atual.y.toFixed(4));
      if (foto) foto.style.translate = `${(-atual.x * 14).toFixed(2)}px ${(-atual.y * 10).toFixed(2)}px`;
      quadro = parado ? 0 : requestAnimationFrame(passo);
    };

    const acordar = () => {
      if (!quadro) quadro = requestAnimationFrame(passo);
    };

    const aoMover = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") return;
      alvo.x = (ev.clientX / window.innerWidth) * 2 - 1;
      alvo.y = (ev.clientY / window.innerHeight) * 2 - 1;
      acordar();
    };
    // Saindo da janela, tudo volta ao centro devagar em vez de ficar torto.
    const aoSair = () => {
      alvo.x = 0;
      alvo.y = 0;
      acordar();
    };

    window.addEventListener("pointermove", aoMover, { passive: true });
    document.documentElement.addEventListener("pointerleave", aoSair);
    return () => {
      window.removeEventListener("pointermove", aoMover);
      document.documentElement.removeEventListener("pointerleave", aoSair);
      cancelAnimationFrame(quadro);
      if (foto) foto.style.translate = "";
    };
  }, []);

  return <span ref={medidor} aria-hidden className="hidden" />;
}

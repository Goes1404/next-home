"use client";

import { useEffect, useRef } from "react";

/** Abaixo disto o botão nunca some: perto do topo ninguém está lendo texto longo. */
const LIMIAR_PX = 200;
/** Gesto menor que isto é ruído do dedo, não direção. */
const PASSO_MINIMO_PX = 8;
/** Parou de rolar por este tempo: o botão volta, esteja onde estiver. */
const REPOUSO_MS = 1400;

/**
 * Decide QUANDO o botão flutuante aparece — o quê ele é fica no chamador.
 *
 * O pedido (10/09/2026) foi "às vezes sobrepõe textos importantes". Um botão
 * fixo cobre, por definição, o que passa embaixo dele; o que dá para fazer é
 * sair da frente nos momentos em que a pessoa está LENDO, e voltar quando
 * ela pode querer agir:
 *
 * - some ao rolar para BAIXO (leitura) e volta ao rolar para CIMA — o mesmo
 *   gesto que traz o header de volta, ver HeaderCondensado;
 * - volta sozinho depois de 1,4s parado, para nunca ficar inalcançável;
 * - some enquanto o RODAPÉ está na tela: ali estão os telefones por
 *   extenso, e é o trecho que ele mais cobria;
 * - some enquanto um campo tem o foco: o teclado já ocupa a base da tela,
 *   e o botão ficaria em cima do que a pessoa digita.
 *
 * Escreve só um atributo (`data-flutuante`); o movimento é do CSS, que
 * também o desliga em `prefers-reduced-motion`.
 */
export function FlutuanteVisivel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let ultimoY = window.scrollY;
    let rolandoParaBaixo = false;
    let rodapeVisivel = false;
    let campoComFoco = false;
    let repouso: number | undefined;

    const aplicar = () => {
      const oculto = rolandoParaBaixo || rodapeVisivel || campoComFoco;
      el.dataset.flutuante = oculto ? "oculto" : "visivel";
    };

    const aoRolar = () => {
      const y = window.scrollY;
      const delta = y - ultimoY;
      if (Math.abs(delta) >= PASSO_MINIMO_PX) {
        rolandoParaBaixo = delta > 0 && y > LIMIAR_PX;
        ultimoY = y;
        aplicar();
      }
      window.clearTimeout(repouso);
      repouso = window.setTimeout(() => {
        rolandoParaBaixo = false;
        aplicar();
      }, REPOUSO_MS);
    };

    const ehCampo = (alvo: EventTarget | null) =>
      alvo instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName);
    const aoFocar = (e: FocusEvent) => {
      if (!ehCampo(e.target)) return;
      campoComFoco = true;
      aplicar();
    };
    const aoDesfocar = (e: FocusEvent) => {
      if (!ehCampo(e.target)) return;
      campoComFoco = false;
      aplicar();
    };

    const rodape = document.querySelector("footer");
    const observador = rodape
      ? new IntersectionObserver(
          ([entrada]) => {
            rodapeVisivel = entrada.isIntersecting;
            aplicar();
          },
          { threshold: 0.05 },
        )
      : null;
    observador?.observe(rodape!);

    window.addEventListener("scroll", aoRolar, { passive: true });
    document.addEventListener("focusin", aoFocar);
    document.addEventListener("focusout", aoDesfocar);
    aplicar();

    return () => {
      window.removeEventListener("scroll", aoRolar);
      document.removeEventListener("focusin", aoFocar);
      document.removeEventListener("focusout", aoDesfocar);
      observador?.disconnect();
      window.clearTimeout(repouso);
    };
  }, []);

  return (
    <div ref={ref} data-flutuante="visivel" className="pb-safe fixed right-4 bottom-4 z-30 sm:bottom-6">
      {children}
    </div>
  );
}

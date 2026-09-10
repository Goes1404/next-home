"use client";

import { useRef } from "react";
import { useCamada } from "@/components/motion/Camada";

/**
 * Dá parallax ao fundo da home.
 *
 * O fundo é `fixed inset-0`, o que já entrega o parallax mais barato que
 * existe — a página desliza por cima de uma peça parada. O que faltava era
 * o fundo REAGIR: aqui ele desce de leve e amplia um tico conforme o
 * scroll avança, e a diferença entre o que sobe (conteúdo) e o que desce
 * (marca) é o que se lê como profundidade.
 *
 * ## Duas armadilhas desta base, as duas já pagas antes
 *
 * 1. Elemento `fixed` NÃO SERVE de referência de scroll: o retângulo dele
 *    é sempre a viewport, o progresso dá zero para sempre e nada se move.
 *    Foi assim que a capa do hero do imóvel nasceu parada. Por isso quem
 *    se registra na camada é um MEDIDOR irmão (`absolute inset-0`), que
 *    rola com a seção do hero, e ele conduz o fundo pelo `aoAtualizar`.
 * 2. Dois donos do mesmo transform brigam. A `AberturaHome` já escreve
 *    `scale` e `filter` em `[data-fundo-video]` (o recuo da vinheta),
 *    então este componente escreve no INVÓLUCRO — `[data-fundo-parallax]`,
 *    um nó acima — e os dois se compõem sem se sobrescrever.
 */
export function ParallaxFundoHome() {
  const medidor = useRef<HTMLSpanElement>(null);

  useCamada(medidor, {
    // O medidor não se move: ele só informa o progresso. Daí velocidade 0.
    velocidade: 0,
    aoAtualizar: (progresso, fator) => {
      /*
       * No CELULAR este parallax está desligado (10/09/2026). Relatado como
       * "o fundo fica travando, fica maior, menor": o fundo é um nó `fixed`
       * com dois vídeos decodificando, e escrever `translate3d` + `scale`
       * nele a cada quadro, por cima do scroll nativo do toque (o Lenis não
       * assume o toque, ver SmoothScroll), é o que engasgava — e o `scale`
       * é exatamente o "maior, menor". A outra metade do sintoma era a
       * barra de endereço redimensionando a caixa (ver `h-lvh` no layout).
       * O desktop continua com o efeito: lá o fundo tem um vídeo só e o
       * scroll passa pelo Lenis, no mesmo relógio deste callback.
       */
      if (window.innerWidth < 768) return;

      const fundo = document.querySelector<HTMLElement>("[data-fundo-parallax]");
      if (!fundo) return;

      // Só a metade positiva é percorrida: o hero nasce colado no topo, e o
      // progresso vai de 0 (topo da página) a 1 (hero saindo por cima).
      const p = Math.max(0, Math.min(1, progresso));

      /*
       * O `fator` entra à mão porque quem escreve é este callback, não o
       * controlador — sem ele o celular rodaria a intensidade cheia (e é
       * justamente no celular que este fundo aparece).
       */
      const y = p * 0.14 * fator * window.innerHeight;
      fundo.style.transform = `translate3d(0, ${y}px, 0) scale(${1 + p * 0.06 * fator})`;
    },
  });

  return <span ref={medidor} aria-hidden className="pointer-events-none absolute inset-0" />;
}

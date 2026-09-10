"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Um número que CONTA até o valor quando entra na tela.
 *
 * É o único movimento não pedido desta página, e existe por uma razão: numa
 * faixa de prova o que importa é o número ser notado. Contar chama o olho uma
 * vez, no momento em que a faixa aparece, e para — diferente de um brilho que
 * fica pulsando e compete com o conteúdo (a régua do painel, 07/09).
 *
 * ## Leve por construção
 *
 * `IntersectionObserver` em vez de laço de scroll: o navegador avisa, ninguém
 * fica perguntando. A contagem dura 900ms, roda em `requestAnimationFrame` e
 * se desliga sozinha no fim — não há timer vivo depois disso. Uma vez só por
 * carga: reentrar na tela não reinicia, senão rolar para cima e para baixo
 * viraria um piscar.
 *
 * ## Sem salto de layout
 *
 * O valor final é renderizado no HTML do servidor e a contagem só ROLA por
 * cima dele — quem tem JavaScript desligado, movimento reduzido ou um leitor
 * de tela recebe o número certo, sem depender de nada disto.
 */
export function NumeroQueConta({ valor, className }: { valor: number; className?: string }) {
  const [exibido, setExibido] = useState(valor);
  const alvo = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const no = alvo.current;
    if (!no) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Contar de 0 até 3 é mais piscada que animação; abaixo disso não vale.
    if (valor < 4) return;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        observador.disconnect();

        const DURACAO = 900;
        const inicio = performance.now();
        setExibido(0);

        const passo = (agora: number) => {
          const t = Math.min(1, (agora - inicio) / DURACAO);
          // Desacelera no fim (ease-out cúbico): a chegada no número é o que
          // o olho lê, e chegar em velocidade constante parece contador de
          // posto de gasolina.
          const suave = 1 - Math.pow(1 - t, 3);
          setExibido(Math.round(valor * suave));
          if (t < 1) requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      },
      { threshold: 0.4 },
    );

    observador.observe(no);
    return () => observador.disconnect();
  }, [valor]);

  return (
    <span ref={alvo} className={className}>
      {exibido}
    </span>
  );
}

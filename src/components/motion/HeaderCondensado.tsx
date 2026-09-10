"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

/**
 * Header que condensa ao sair do topo — e, no celular, que se ESCONDE ao
 * rolar para baixo e volta ao rolar para cima.
 *
 * ## Dois atributos, dois efeitos
 *
 * `data-condensado` encolhe o respiro e fecha o vidro depois de 80px, em
 * toda largura. `data-oculto` só é escrito abaixo de 768px: quem está lendo
 * no telefone rola para baixo, e a barra fixa de 64px é um sexto da tela
 * que ele não pediu; ao primeiro gesto para cima ela volta, que é quando
 * alguém procura navegação. É a animação "ao arrastar" pedida em 10/09/2026
 * — responde ao gesto, não roda sozinha.
 *
 * ## Transform aqui é seguro desde que o menu virou portal
 *
 * A versão anterior evitava transform porque o painel do MenuMobile era
 * `fixed` DENTRO do header, e transform no ancestral criaria containing
 * block. O painel mora num portal no `<body>` desde então; nada `fixed`
 * vive aqui. Se um dia voltar a viver, este atributo tem de sair antes.
 *
 * O estado é lido no ticker do GSAP (o mesmo do Lenis, ver SmoothScroll) e
 * só escreve quando MUDA de faixa: carimbar atributo a 60fps invalidaria
 * estilo à toa.
 */
const LIMIAR_PX = 80;
/** Antes disto o header nunca se esconde: perto do topo ele é a orientação. */
const LIMIAR_OCULTAR_PX = 160;
/** Gesto menor que isto é ruído do dedo, não intenção de direção. */
const PASSO_MINIMO_PX = 6;

export function HeaderCondensado({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let condensado: boolean | null = null;
    let oculto = false;
    let ultimoY = window.scrollY;

    const conferir = () => {
      const y = window.scrollY;

      const agora = y > LIMIAR_PX;
      if (agora !== condensado) {
        condensado = agora;
        el.dataset.condensado = agora ? "sim" : "nao";
      }

      if (window.innerWidth >= 768) {
        if (oculto) {
          oculto = false;
          el.dataset.oculto = "nao";
        }
        return;
      }

      const delta = y - ultimoY;
      if (Math.abs(delta) < PASSO_MINIMO_PX && y > LIMIAR_OCULTAR_PX) return;
      ultimoY = y;

      // Com o menu aberto o header segura o botão de fechar: nunca some.
      const menuAberto = el.querySelector('[aria-expanded="true"]') !== null;
      const deveOcultar = delta > 0 && y > LIMIAR_OCULTAR_PX && !menuAberto;
      if (deveOcultar !== oculto) {
        oculto = deveOcultar;
        el.dataset.oculto = oculto ? "sim" : "nao";
      }
    };

    conferir();
    gsap.ticker.add(conferir);
    return () => gsap.ticker.remove(conferir);
  }, []);

  return (
    <header ref={ref} data-condensado="nao" data-oculto="nao" className={className}>
      {children}
    </header>
  );
}

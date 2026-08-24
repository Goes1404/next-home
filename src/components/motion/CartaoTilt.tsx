"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCamada } from "./Camada";

/**
 * Moldura com duas camadas de efeito, para as fotos da galeria:
 *
 * 1. ENTRADA por cortina — a imagem é revelada por um `clip-path` que abre de
 *    baixo para cima enquanto ela mesma desamplia. Mais editorial que o fade
 *    do Reveal comum: a foto não "acende", ela é descoberta.
 * 2. TILT no ponteiro — inclinação 3D leve seguindo o cursor, com um brilho
 *    que acompanha a posição. Só no ponteiro FINO (mouse): no toque a
 *    inclinação disputaria com a rolagem e o dedo cobre justamente o brilho.
 *
 * Tudo em transform/clip-path — nenhuma propriedade que peça relayout. Com
 * `prefers-reduced-motion` o componente é uma div comum: o conteúdo aparece
 * inteiro, sem cortina e sem tilt.
 */
export function CartaoTilt({
  children,
  className,
  indice = 0,
  velocidadeCamada = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Posição na grade — escalona a entrada sem depender de um pai. */
  indice?: number;
  /**
   * Deslocamento do conteúdo DENTRO da moldura. `0` desliga e o componente
   * se comporta exatamente como antes.
   *
   * A camada vai num nó interno, nunca no externo: o externo já é dono do
   * `clipPath` e das rotações do tilt, e somar `y` ali seria dois donos da
   * mesma matriz de transform.
   */
  velocidadeCamada?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const interno = useRef<HTMLDivElement>(null);

  useCamada(interno, { velocidade: velocidadeCamada });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.clipPath = "none";
      el.style.opacity = "1";
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    /**
     * O zoom de entrada é PULADO quando há camada: ali o primeiro filho é o
     * nó da camada, cuja `scale-110` é a folga contra borda vazia. Animar a
     * escala dele até 1 apagaria essa folga para sempre, e o deslocamento
     * passaria a mostrar o fundo da moldura. A cortina do `clip-path`
     * continua, que é o que dá a entrada.
     */
    const primeiroFilho = velocidadeCamada
      ? null
      : (el.firstElementChild as HTMLElement | null);

    const contexto = gsap.context(() => {
      // Assume a opacidade ANTES de soltar a classe (contrato do Reveal): a
      // cortina do clip-path é quem esconde daqui em diante.
      gsap.set(el, { opacity: 1, clipPath: "inset(100% 0% 0% 0%)" });
      el.classList.remove("gsap-pending");
      if (primeiroFilho) gsap.set(primeiroFilho, { scale: 1.18 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
        delay: (indice % 3) * 0.09,
      });

      tl.to(el, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.05, ease: "power3.inOut" }, 0);
      if (primeiroFilho) {
        tl.to(primeiroFilho, { scale: 1, duration: 1.4, ease: "power2.out" }, 0);
      }
    }, el);

    // Tilt: mouse apenas. `pointer: fine` é o teste certo — largura de tela
    // não distingue tablet com dedo de laptop pequeno.
    const fino = window.matchMedia("(pointer: fine)");
    let limpar: (() => void) | undefined;

    const ligarTilt = () => {
      if (!fino.matches) return;

      const setRotX = gsap.quickTo(el, "rotationX", { duration: 0.5, ease: "power2.out" });
      const setRotY = gsap.quickTo(el, "rotationY", { duration: 0.5, ease: "power2.out" });

      const aoMover = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        setRotY(px * 9);
        setRotX(-py * 9);
        el.style.setProperty("--brilho-x", `${(px + 0.5) * 100}%`);
        el.style.setProperty("--brilho-y", `${(py + 0.5) * 100}%`);
      };

      const aoSair = () => {
        setRotX(0);
        setRotY(0);
      };

      el.addEventListener("pointermove", aoMover);
      el.addEventListener("pointerleave", aoSair);
      limpar = () => {
        el.removeEventListener("pointermove", aoMover);
        el.removeEventListener("pointerleave", aoSair);
      };
    };

    ligarTilt();

    return () => {
      contexto.revert();
      limpar?.();
    };
  }, [indice, velocidadeCamada]);

  return (
    <div
      ref={ref}
      // `opacity-0` inicial pelo mesmo motivo do `.gsap-pending`: sem JS a
      // regra `.no-js`/`.motion-off` do globals.css devolve a opacidade.
      className={`gsap-pending group/tilt relative [transform-style:preserve-3d] [perspective:1000px] ${className ?? ""}`}
    >
      {/* Com camada, o conteúdo ganha um nó próprio (e a folga do `scale-110`
          contra borda vazia). Sem ela, os filhos ficam onde sempre estiveram
          — inclusive para o `firstElementChild` que a cortina amplia. */}
      {velocidadeCamada ? (
        <div ref={interno} className="absolute inset-0 scale-110 will-change-transform">
          {children}
        </div>
      ) : (
        children
      )}
      {/* Brilho que segue o cursor. `pointer-events-none` para nunca roubar o
          clique do botão que abre o Lightbox. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover/tilt:opacity-100"
        style={{
          background:
            "radial-gradient(circle at var(--brilho-x, 50%) var(--brilho-y, 50%), rgba(255,255,255,0.16), transparent 55%)",
        }}
      />
    </div>
  );
}

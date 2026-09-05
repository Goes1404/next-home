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
 *
 * ## O nó escalado vive dentro de um corte de LAYOUT (04/09/2026)
 *
 * O zoom de entrada (1.18 → 1) escalava o `firstElementChild` — sem camada,
 * o próprio `<a>` do cartão, em fluxo. `clip-path` esconde a PINTURA, não o
 * layout: transform não muda a caixa, mas estende a área rolável, e um
 * cartão de 328px a 1.18 contava 387. Como o `scale` é gravado na montagem e
 * só volta a 1 quando o cartão entra na tela, todo cartão abaixo da dobra
 * deixava a home 14-19px mais larga que o celular — o navegador afastava a
 * câmera e deixava arrastar de lado. Medido em 360/390/412 com JS rodando.
 *
 * Hoje o zoom mira um wrapper interno próprio e o nó do tilt tem
 * `overflow-clip`: `clip` (não `hidden`) não vira contêiner de rolagem, não
 * cria containing block para `fixed` e não é propriedade de agrupamento —
 * o `preserve-3d` sobrevive. E o corte é no espaço do próprio nó, então gira
 * junto com o tilt em vez de raspar canto. Como o `clip-path: inset(0)` já
 * cortava a pintura à caixa, nada muda na tela; muda o que a página mede.
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
  // Dois refs, um por ramo: registrar o wrapper do zoom como camada (mesmo a
  // velocidade 0) faria o controlador escrever `y: 0` nele todo frame, por
  // cima do `scale` do GSAP.
  const camada = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDivElement>(null);

  useCamada(camada, { velocidade: velocidadeCamada });

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
     * O zoom de entrada é PULADO quando há camada: o nó da camada tem a
     * `scale-110` como folga contra borda vazia, e animar a escala dele até 1
     * apagaria essa folga para sempre. Sem camada, o alvo é o wrapper `zoom`
     * — nunca um filho arbitrário: é o único jeito de garantir que o nó
     * escalado está dentro do `overflow-clip` do próprio cartão.
     */
    const alvoZoom = velocidadeCamada ? null : zoom.current;

    const contexto = gsap.context(() => {
      // Assume a opacidade ANTES de soltar a classe (contrato do Reveal): a
      // cortina do clip-path é quem esconde daqui em diante.
      gsap.set(el, { opacity: 1, clipPath: "inset(100% 0% 0% 0%)" });
      el.classList.remove("gsap-pending");
      if (alvoZoom) gsap.set(alvoZoom, { scale: 1.18 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
        delay: (indice % 3) * 0.09,
      });

      tl.to(el, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.05, ease: "power3.inOut" }, 0);
      if (alvoZoom) {
        tl.to(alvoZoom, { scale: 1, duration: 1.4, ease: "power2.out" }, 0);
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
      // `overflow-clip` é o corte de LAYOUT que a cortina de clip-path não
      // dá: sem ele, o filho a 1.18 alargava a página (ver cabeçalho).
      className={`gsap-pending group/tilt relative overflow-clip [transform-style:preserve-3d] [perspective:1000px] ${className ?? ""}`}
    >
      {/* O conteúdo SEMPRE ganha um nó próprio. Com camada, o nó absoluto com a
          folga do `scale-110`; sem ela, o wrapper em fluxo que a entrada
          amplia — sem `will-change-transform`, que criaria containing block
          para filhos arbitrários (o GSAP promove durante o tween). */}
      {velocidadeCamada ? (
        <div ref={camada} className="absolute inset-0 scale-110 will-change-transform">
          {children}
        </div>
      ) : (
        <div ref={zoom}>{children}</div>
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

"use client";

import { useEffect } from "react";
import { gsap } from "gsap";

/**
 * O fundo recua depois da vinheta.
 *
 * Até 13/09/2026 este componente também revelava os elementos do hero
 * (`[data-abertura]`): eles nasciam com `opacity: 0` e só apareciam quando o
 * GSAP hidratava e rodava a timeline. Medido no celular de referência, isso
 * custava um LCP de 10,6 s — 99% dele "atraso de renderização", esperando
 * JavaScript para mostrar texto que já estava no HTML. A chegada do hero
 * passou para CSS puro (`@keyframes chegada` em globals.css, disparada pela
 * queda de `data-intro-ativa`): roda antes de qualquer script, e se o
 * JavaScript falhar o conteúdo simplesmente está lá.
 *
 * O que sobra aqui é o que só o GSAP faz bem: o vídeo de fundo entra
 * ampliado e ASSENTA no lugar enquanto o conteúdo sobe — a peça de marca
 * deixa de ser o assunto e vira ambiente. É efeito sobre o FUNDO, não sobre
 * conteúdo: pode chegar tarde sem custar nada ao visitante.
 *
 * O gatilho é o FIM da vinheta: enquanto o Preloader está na tela o `<html>`
 * carrega `data-intro-ativa`, e é a queda desse atributo que dispara o recuo.
 * Sem vinheta na sessão (celular, segunda visita, movimento reduzido), o
 * atributo nunca existe e o recuo roda de imediato.
 */

const VIDEO_FUNDO = "[data-fundo-video]";

export function AberturaHome() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const raiz = document.documentElement;
    let executado = false;

    const recuar = () => {
      if (executado) return;
      executado = true;

      const video = document.querySelector<HTMLElement>(VIDEO_FUNDO);
      if (!video) return;

      /*
       * Sai de perto (escala 1,22), desfocada e mais acesa, e assenta.
       * 2,2s é o número que sobrou de calibrar nos dois lados: abaixo de
       * ~1,5s o recuo parece corte; acima de ~3s a página fica esperando.
       * `force3D` porque é um elemento do tamanho da tela — sem ele a escala
       * pede recomposição a cada quadro.
       */
      gsap.fromTo(
        video,
        { scale: 1.22, filter: "blur(10px) brightness(1.25)" },
        {
          scale: 1,
          filter: "blur(0px) brightness(1)",
          duration: 2.2,
          ease: "power2.out",
          force3D: true,
        },
      );
    };

    if (!raiz.dataset.introAtiva) {
      recuar();
      return;
    }

    const observador = new MutationObserver(() => {
      if (!raiz.dataset.introAtiva) {
        observador.disconnect();
        recuar();
      }
    });
    observador.observe(raiz, { attributes: true, attributeFilter: ["data-intro-ativa"] });

    // Rede de segurança: se a vinheta morrer sem limpar o atributo, o fundo
    // ainda assenta (o conteúdo, esse já se solta sozinho pelo CSS).
    const socorro = window.setTimeout(() => {
      observador.disconnect();
      recuar();
    }, 12000);

    return () => {
      observador.disconnect();
      window.clearTimeout(socorro);
    };
  }, []);

  return null;
}

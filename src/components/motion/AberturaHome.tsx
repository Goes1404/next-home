"use client";

import { useEffect } from "react";
import { gsap } from "gsap";

/**
 * A chegada da página depois da vinheta.
 *
 * O CSS de `[data-intro-ativa]` (globals.css) já soltava o conteúdo em
 * cascata, mas ele opera em `main > *` — e a home tem só DOIS filhos diretos
 * (o hero e o bloco opaco), então a cascata praticamente não aparecia. Aqui a
 * chegada é orquestrada elemento a elemento dentro do hero, que é o que o
 * visitante de fato vê no primeiro segundo.
 *
 * O gatilho é o FIM da vinheta, não o load: enquanto o Preloader está na tela
 * o `<html>` carrega `data-intro-ativa`, e é a queda desse atributo que
 * dispara a timeline (MutationObserver). Sem vinheta na sessão — segunda
 * visita, movimento reduzido, Save-Data — o atributo nunca existe e a
 * abertura roda de imediato.
 *
 * O vídeo de fundo participa: entra ampliado e ASSENTA no lugar enquanto o
 * conteúdo sobe, que é o efeito de "ir para o fundo" — a peça de marca deixa
 * de ser o assunto e vira ambiente.
 */

const ELEMENTOS = "[data-abertura]";
const VIDEO_FUNDO = "[data-fundo-video]";

export function AberturaHome() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const raiz = document.documentElement;
    let executado = false;

    const tocar = () => {
      if (executado) return;
      executado = true;

      const alvos = gsap.utils.toArray<HTMLElement>(ELEMENTOS);
      const video = document.querySelector<HTMLElement>(VIDEO_FUNDO);

      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      if (video) {
        // O fundo recua: começa maior e assenta. `force3D` para a escala não
        // pedir relayout a cada quadro num elemento do tamanho da tela.
        tl.fromTo(
          video,
          { scale: 1.14, filter: "blur(6px)" },
          { scale: 1, filter: "blur(0px)", duration: 1.6, ease: "power2.out", force3D: true },
          0,
        );
      }

      if (alvos.length > 0) {
        // O GSAP assume a opacidade ANTES de o CSS soltá-la: `gsap-pending`
        // é opacity 0, e tirar a classe sem ter o valor sob controle daria
        // um flash do conteúdo já posicionado.
        gsap.set(alvos, { autoAlpha: 0, y: 34 });
        alvos.forEach((el) => el.classList.remove("gsap-pending"));

        tl.to(alvos, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.11 }, 0.15);
      }
    };

    // Sem vinheta nesta sessão: a página já pode chegar.
    if (!raiz.dataset.introAtiva) {
      tocar();
      return;
    }

    const observador = new MutationObserver(() => {
      if (!raiz.dataset.introAtiva) {
        observador.disconnect();
        tocar();
      }
    });
    observador.observe(raiz, { attributes: true, attributeFilter: ["data-intro-ativa"] });

    // Rede de segurança, no espírito da `intro-socorro` do CSS: se a vinheta
    // morrer sem limpar o atributo, o conteúdo não pode ficar invisível.
    const socorro = window.setTimeout(() => {
      observador.disconnect();
      tocar();
    }, 12000);

    return () => {
      observador.disconnect();
      window.clearTimeout(socorro);
    };
  }, []);

  return null;
}

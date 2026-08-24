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
        /*
         * O fundo RECUA: a vinheta acaba de encher a tela no Preloader e
         * agora se afasta até virar ambiente — sai de perto (escala 1,22),
         * desfocada e mais acesa, e assenta no lugar.
         *
         * 2,2s é o número que sobrou de calibrar nos dois lados: abaixo de
         * ~1,5s o recuo parece corte e o olho lê como falha; acima de ~3s a
         * página fica esperando e a espera vira desconfiança. `force3D`
         * porque isto é um elemento do tamanho da tela — sem ele a escala
         * pede recomposição a cada quadro.
         */
        tl.fromTo(
          video,
          { scale: 1.22, filter: "blur(10px) brightness(1.25)" },
          {
            scale: 1,
            filter: "blur(0px) brightness(1)",
            duration: 2.2,
            ease: "power2.out",
            force3D: true,
          },
          0,
        );
      }

      if (alvos.length > 0) {
        // O GSAP assume a opacidade ANTES de o CSS soltá-la: `gsap-pending`
        // é opacity 0, e tirar a classe sem ter o valor sob controle daria
        // um flash do conteúdo já posicionado.
        gsap.set(alvos, { autoAlpha: 0, y: 42 });
        alvos.forEach((el) => el.classList.remove("gsap-pending"));

        /*
         * Os elementos chegam DEPOIS de o fundo já ter começado a recuar
         * (0,45s), um atrás do outro. O intervalo de 0,16s entre eles é o que
         * faz a chegada ser lida como sequência e não como bloco; com 1,15s
         * cada, o conjunto todo fecha por volta de 2,2s — junto com o fundo,
         * sem ninguém esperando o outro.
         */
        tl.to(
          alvos,
          { autoAlpha: 1, y: 0, duration: 1.15, stagger: 0.16, ease: "power3.out" },
          0.45,
        );
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

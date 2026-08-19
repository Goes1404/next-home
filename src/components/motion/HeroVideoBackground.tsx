"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGlassBackground } from "@/components/glass/GlassBackground";

type NavigatorEstendido = Navigator & {
  connection?: { saveData?: boolean };
};

const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

/** Não exibe se o usuário pediu menos movimento ou está economizando dados. */
function podeExibirVideo(): boolean {
  if (window.matchMedia(CONSULTA_MOVIMENTO).matches) return false;
  if ((navigator as NavigatorEstendido).connection?.saveData) return false;
  return true;
}

function inscrever(aoMudar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_MOVIMENTO);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}

/**
 * `false` no servidor e na primeira pintura — o HTML entregue nunca contém
 * o vídeo, então quem pediu movimento reduzido ou economia de dados não
 * chega a baixar o arquivo.
 */
function usePodeExibirVideo(): boolean {
  return useSyncExternalStore(inscrever, podeExibirVideo, () => false);
}

/**
 * Vídeo decorativo por trás do hero, com o próprio scroll da página como
 * controle remoto: no topo mostra o primeiro quadro, no fim da página
 * mostra o último, e rolar pra cima volta o vídeo — nunca toca sozinho.
 *
 * A imagem estática (renderizada pelo chamador, por baixo deste componente)
 * garante um LCP rápido via SSR; o vídeo só começa a baixar depois de
 * montado no cliente e só aparece quando os metadados chegam — daí o
 * fade-in em vez de um corte brusco.
 *
 * O `ScrollTrigger` compartilha o relógio do Lenis (ver SmoothScroll.tsx),
 * então o progresso lido aqui é o mesmo scroll suavizado que o resto do
 * site anima com — sem isso o vídeo saltaria à frente do que a rolagem
 * suave ainda está desenhando na tela. `gsap.to` interpola o `currentTime`
 * em vez de saltar direto: esconde os soluços de um vídeo com poucos
 * keyframes por segundo.
 *
 * Assim que os metadados chegam, se registra no `GlassBackgroundProvider` —
 * os painéis de vidro passam a refratar o próprio vídeo (ver
 * GlassCanvas.tsx), em vez de caírem no gradiente procedural que existe
 * para quando não há nada para refratar.
 */
export function HeroVideoBackground({ src }: { src: string }) {
  const permitido = usePodeExibirVideo();
  const [pronto, setPronto] = useState(false);
  const { definirVideo } = useGlassBackground();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => definirVideo(null);
  }, [definirVideo]);

  useEffect(() => {
    if (!pronto) return;
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;

    gsap.registerPlugin(ScrollTrigger);
    const gatilho = ScrollTrigger.create({
      // Sem `trigger`, só o range numérico: com `document.documentElement`
      // como trigger, `top top`/`bottom bottom` nunca reconhece o scroll da
      // página inteira (o retângulo do próprio <html> não se move) — o
      // `onUpdate` simplesmente não dispara. Faixa numérica é o jeito que
      // funciona para "progresso da página toda".
      start: 0,
      end: () => document.documentElement.scrollHeight - window.innerHeight,
      onUpdate: (self) => {
        gsap.to(video, {
          currentTime: self.progress * video.duration,
          duration: 0.5,
          ease: "power1.out",
          overwrite: true,
        });
      },
    });

    return () => gatilho.kill();
  }, [pronto]);

  if (!permitido) return null;

  return (
    <video
      key={src}
      ref={videoRef}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
        pronto ? "opacity-100" : "opacity-0"
      }`}
      muted
      playsInline
      preload="auto"
      // O vídeo vira textura WebGL (GlassCanvas) — sem crossOrigin, o WebGL
      // recusa ler pixels de um <video> de outra origem (o bucket do
      // Supabase Storage usado pelo fundo personalizado do corretor).
      crossOrigin="anonymous"
      onLoadedMetadata={() => {
        setPronto(true);
        definirVideo(videoRef.current);
      }}
      aria-hidden
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGlassBackground } from "@/components/glass/GlassBackground";

type NavigatorEstendido = Navigator & {
  connection?: { saveData?: boolean };
};

const CONSULTA_MOVIMENTO = "(prefers-reduced-motion: reduce)";

/** Não reproduz se o usuário pediu menos movimento ou está economizando dados. */
function podeReproduzir(): boolean {
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
function usePodeReproduzir(): boolean {
  return useSyncExternalStore(inscrever, podeReproduzir, () => false);
}

/**
 * Vídeo decorativo por trás do hero. A imagem estática (renderizada pelo
 * chamador, por baixo deste componente) garante um LCP rápido via SSR; o
 * vídeo só começa a baixar depois de montado no cliente e só aparece quando
 * está pronto para tocar — daí o fade-in em vez de um corte brusco.
 *
 * Assim que pode tocar, se registra no `GlassBackgroundProvider` — os
 * painéis de vidro passam a refratar o próprio vídeo (ver GlassCanvas.tsx),
 * em vez de caírem no gradiente procedural que existe para quando não há
 * nada para refratar.
 */
export function HeroVideoBackground({ src }: { src: string }) {
  const permitido = usePodeReproduzir();
  const [pronto, setPronto] = useState(false);
  const { definirVideo } = useGlassBackground();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    return () => definirVideo(null);
  }, [definirVideo]);

  if (!permitido) return null;

  return (
    <video
      ref={videoRef}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
        pronto ? "opacity-100" : "opacity-0"
      }`}
      autoPlay
      muted
      playsInline
      preload="auto"
      // O vídeo vira textura WebGL (GlassCanvas) — sem crossOrigin, o
      // WebGL recusa ler pixels de um <video> de outra origem (o bucket do
      // Supabase Storage), mesmo o elemento tocando normalmente na tela.
      crossOrigin="anonymous"
      onCanPlay={() => {
        setPronto(true);
        definirVideo(videoRef.current);
      }}
      // Sem `loop`: toca só até 1s e para ali, congelando naquele quadro em
      // vez de repetir o clipe inteiro sem fim.
      onTimeUpdate={(e) => {
        if (e.currentTarget.currentTime >= 1) e.currentTarget.pause();
      }}
      aria-hidden
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}

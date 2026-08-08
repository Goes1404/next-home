"use client";

import { useState, useSyncExternalStore } from "react";

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
 */
export function HeroVideoBackground({ src }: { src: string }) {
  const permitido = usePodeReproduzir();
  const [pronto, setPronto] = useState(false);

  if (!permitido) return null;

  return (
    <video
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
        pronto ? "opacity-100" : "opacity-0"
      }`}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      onCanPlay={() => setPronto(true)}
      aria-hidden
    >
      <source src={src} type="video/mp4" />
    </video>
  );
}

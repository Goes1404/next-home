"use client";

import { useEffect, useState } from "react";

type NavigatorEstendido = Navigator & {
  connection?: { saveData?: boolean };
};

/** Não reproduz se o usuário pediu menos movimento ou está economizando dados. */
function podeReproduzir(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if ((navigator as NavigatorEstendido).connection?.saveData) return false;
  return true;
}

/**
 * Vídeo decorativo por trás do hero. A imagem estática (renderizada pelo
 * chamador, por baixo deste componente) garante um LCP rápido via SSR; o
 * vídeo só começa a baixar depois de montado no cliente e só aparece quando
 * está pronto para tocar — daí o fade-in em vez de um corte brusco.
 *
 * Retorna `null` até confirmar que é apropriado reproduzir, então nunca
 * baixa o arquivo de vídeo para quem pediu `prefers-reduced-motion` ou tem
 * Data Saver ativo.
 */
export function HeroVideoBackground({ src }: { src: string }) {
  const [permitido, setPermitido] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setPermitido(podeReproduzir());
  }, []);

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

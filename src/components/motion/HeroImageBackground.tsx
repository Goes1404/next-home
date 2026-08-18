"use client";

import { useEffect } from "react";
import { useGlassBackground } from "@/components/glass/GlassBackground";

/**
 * Fundo estático por trás do hero, alternativa ao `HeroVideoBackground`
 * quando o corretor escolheu uma foto em vez de vídeo. Registra a imagem no
 * `GlassBackgroundProvider` pra os painéis de vidro refratarem — o próprio
 * `GlassCanvas` carrega a textura a partir da URL, sem precisar deste
 * elemento (ver `definirFundo` em `GlassBackground.tsx`).
 */
export function HeroImageBackground({ src }: { src: string }) {
  const { definirFundo } = useGlassBackground();

  useEffect(() => {
    definirFundo(src);
    return () => definirFundo(null);
  }, [src, definirFundo]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- full-bleed decorativo, mesmo padrão do HeroVideoBackground (não passa por otimização do next/image).
    <img src={src} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
  );
}

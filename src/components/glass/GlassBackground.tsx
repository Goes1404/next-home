"use client";

import { createContext, useContext, useMemo, useState } from "react";

type Contexto = {
  /** Imagem full-bleed que os painéis de vidro devem refratar. */
  src: string | null;
  definirFundo: (src: string | null) => void;
  /**
   * Vídeo full-bleed em reprodução, se houver — tem prioridade sobre `src`
   * como fonte de refração (ver GlassCanvas.tsx). Registrado pelo próprio
   * `<video>` (HeroVideoBackground) assim que está pronto pra tocar.
   */
  video: HTMLVideoElement | null;
  definirVideo: (video: HTMLVideoElement | null) => void;
};

const GlassBackgroundContext = createContext<Contexto>({
  src: null,
  definirFundo: () => {},
  video: null,
  definirVideo: () => {},
});

/**
 * Guarda qual imagem (ou vídeo) está ocupando o fundo da tela no momento.
 *
 * Cada seção full-bleed (o hero da home, o hero do empreendimento) registra a
 * própria imagem/vídeo aqui, e todo `GlassSurface` da página passa a
 * refratá-la. É o que faz o vidro parecer realmente transparente em vez de
 * decorativo.
 */
export function GlassBackgroundProvider({
  children,
  inicial = null,
}: {
  children: React.ReactNode;
  inicial?: string | null;
}) {
  const [src, definirFundo] = useState<string | null>(inicial);
  const [video, definirVideo] = useState<HTMLVideoElement | null>(null);
  const valor = useMemo(
    () => ({ src, definirFundo, video, definirVideo }),
    [src, video],
  );

  return (
    <GlassBackgroundContext.Provider value={valor}>
      {children}
    </GlassBackgroundContext.Provider>
  );
}

export function useGlassBackground() {
  return useContext(GlassBackgroundContext);
}

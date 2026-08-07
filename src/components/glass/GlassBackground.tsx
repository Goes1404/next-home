"use client";

import { createContext, useContext, useMemo, useState } from "react";

type Contexto = {
  /** Imagem full-bleed que os painéis de vidro devem refratar. */
  src: string | null;
  definirFundo: (src: string | null) => void;
};

const GlassBackgroundContext = createContext<Contexto>({
  src: null,
  definirFundo: () => {},
});

/**
 * Guarda qual imagem está ocupando o fundo da tela no momento.
 *
 * Cada seção full-bleed (o hero da home, o hero do empreendimento) registra a
 * própria imagem aqui, e todo `GlassSurface` da página passa a refratá-la.
 * É o que faz o vidro parecer realmente transparente em vez de decorativo.
 */
export function GlassBackgroundProvider({
  children,
  inicial = null,
}: {
  children: React.ReactNode;
  inicial?: string | null;
}) {
  const [src, definirFundo] = useState<string | null>(inicial);
  const valor = useMemo(() => ({ src, definirFundo }), [src]);

  return (
    <GlassBackgroundContext.Provider value={valor}>
      {children}
    </GlassBackgroundContext.Provider>
  );
}

export function useGlassBackground() {
  return useContext(GlassBackgroundContext);
}

"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import type { LightboxProps } from "./Lightbox";

const carregar = () => import("./Lightbox");

const LightboxReal = dynamic(() => carregar().then((m) => m.Lightbox), { ssr: false });

/**
 * O Lightbox só entra no JavaScript da página quando alguém o ABRE.
 *
 * Ele traz os plugins Flip e Observer do GSAP e ~300 linhas próprias — e
 * estava no primeiro carregamento de toda página do imóvel, executando antes
 * de o título do hero ser revelado, para uma foto que a maioria nunca amplia
 * (F3b do roadmap de performance, 13/09/2026).
 *
 * Fechado, não renderiza nada (o próprio Lightbox já devolvia `null`). O
 * chunk é pré-buscado quando o navegador está ocioso, para o primeiro toque
 * não esperar a rede: quem abre, abre na hora; quem nunca abre, pagou só o
 * download em segundo plano.
 */
export function LightboxAdiado(props: LightboxProps) {
  useEffect(() => {
    // Safari ainda não tem requestIdleCallback; lá vale um timer curto.
    const emOcio = window.requestIdleCallback?.bind(window);
    if (emOcio) {
      const id = emOcio(() => void carregar(), { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => void carregar(), 2000);
    return () => window.clearTimeout(id);
  }, []);

  if (props.indice === null) return null;
  return <LightboxReal {...props} />;
}

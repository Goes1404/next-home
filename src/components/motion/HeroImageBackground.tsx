"use client";

import { useEffect, useState } from "react";
import { useGlassBackground } from "@/components/glass/GlassBackground";

/**
 * Fundo estático por trás do hero, alternativa ao `HeroVideoBackground`
 * quando o corretor escolheu uma foto em vez de vídeo.
 *
 * Duas lições que este arquivo aprendeu na marra:
 *
 * 1. `<img>` cru sem tratamento de erro mostra o ícone de imagem quebrada
 *    do navegador em TELA CHEIA quando a foto some do bucket — foi o
 *    "quebradinho" no topo da página que o cliente reportou. Agora a foto
 *    só entra em cena depois de carregar, e sai de cena se falhar: o piso
 *    é o gradiente do layout, que é desenho, não erro.
 * 2. A URL só é registrada no `GlassBackgroundProvider` DEPOIS de carregar.
 *    Registrar antes fazia o `GlassCanvas` tentar montar textura de uma
 *    imagem inexistente, e o vidro perdia a refração junto com o fundo.
 */
export function HeroImageBackground({ src }: { src: string }) {
  const { definirFundo } = useGlassBackground();
  /*
   * O desfecho é guardado JUNTO com a URL que o produziu, e o estado em
   * vigor sai daí por derivação. Trocar de corretor (src novo) volta
   * sozinho para "carregando", sem um efeito de reset — que seria um
   * re-render a mais e um caminho a mais para errar.
   */
  const [desfecho, setDesfecho] = useState<{ src: string; estado: "pronto" | "falhou" } | null>(null);
  const estado = desfecho?.src === src ? desfecho.estado : "carregando";

  useEffect(() => {
    if (estado !== "pronto") return;
    definirFundo(src);
    return () => definirFundo(null);
  }, [estado, src, definirFundo]);

  if (estado === "falhou") return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- full-bleed decorativo, mesmo padrão do HeroVideoBackground (não passa por otimização do next/image).
    <img
      key={src}
      src={src}
      alt=""
      aria-hidden
      onLoad={() => setDesfecho({ src, estado: "pronto" })}
      onError={() => {
        console.warn("Foto de fundo do corretor indisponível; mantendo o gradiente do site.");
        setDesfecho({ src, estado: "falhou" });
      }}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
        estado === "pronto" ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}

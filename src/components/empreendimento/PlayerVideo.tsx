"use client";

import Image from "next/image";
import { useState } from "react";
import { videoEmbedUrl, youtubeId } from "@/lib/embedMidia";
import { Play } from "lucide-react";

/**
 * Player de vídeo com facade leve.
 *
 * Um iframe do YouTube carrega ~1 MB de script de terceiro por player —
 * numa página com 2-3 vídeos isso pesa mais que o resto da página inteira.
 * A facade mostra só a thumbnail oficial (i.ytimg.com) com um botão de
 * play; o iframe de verdade só nasce no clique, já com autoplay. Vimeo e
 * arquivo direto não têm thumbnail pública estável, então carregam o
 * player de imediato como antes.
 */
export function PlayerVideo({ url, titulo }: { url: string; titulo: string }) {
  const [ativo, setAtivo] = useState(false);
  const embedUrl = videoEmbedUrl(url);
  const ytId = youtubeId(url);

  if (ytId && !ativo) {
    return (
      <button
        type="button"
        onClick={() => setAtivo(true)}
        aria-label={`Assistir: ${titulo}`}
        className="group relative block aspect-video w-full cursor-pointer overflow-hidden bg-ink-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-forte"
      >
        <Image
          src={`https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`}
          alt={titulo}
          fill
          sizes="(min-width: 768px) 768px, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Véu sobre a thumbnail (imagem, não página): escuro nos dois temas. */}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/20" />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 shadow-lg transition-transform duration-300 group-hover:scale-110"
        >
          <Play className="ml-1 h-7 w-7 fill-ink-950 text-ink-950" />
        </span>
        <span className="absolute right-4 bottom-3 left-4 truncate text-left text-sm font-medium text-white drop-shadow">
          {titulo}
        </span>
      </button>
    );
  }

  if (embedUrl) {
    return (
      <iframe
        src={ytId ? `${embedUrl}?autoplay=1` : embedUrl}
        title={titulo}
        className="aspect-video w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    );
  }

  return <video src={url} controls playsInline className="aspect-video w-full" />;
}

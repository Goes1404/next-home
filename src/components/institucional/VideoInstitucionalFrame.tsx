"use client";

import { useState } from "react";
import Image from "next/image";

interface Props {
  videoUrl?: string;
  posterUrl?: string;
  titulo?: string;
}

export function VideoInstitucionalFrame({
  videoUrl = "https://assets.mixkit.co/videos/preview/mixkit-modern-apartment-building-architecture-42354-large.mp4",
  posterUrl = "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1600&auto=format&fit=crop",
  titulo = "Next Home — Experiência Imobiliária em Alphaville",
}: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  return (
    <div className="relative mx-auto w-full max-w-5xl group">
      {/* Glow de fundo elegante */}
      <div className="absolute -inset-1.5 rounded-[2.8rem] bg-gradient-to-r from-brand-500/20 via-brand-400/10 to-teal-500/20 blur-2xl opacity-75 group-hover:opacity-100 transition-opacity duration-700 -z-10" />

      {/* Frame estilo Cinema com cantos generosos */}
      <div className="relative overflow-hidden rounded-[2.2rem] sm:rounded-[2.8rem] border border-white/20 bg-ink-950 shadow-2xl shadow-black/90 aspect-video">
        <video
          src={videoUrl}
          poster={posterUrl}
          autoPlay
          playsInline
          muted={isMuted}
          loop
          className="w-full h-full object-cover"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />

        {/* Gradiente sutil inferior e superior */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-black/30 pointer-events-none" />

        {/* Overlay com Controles Flutuantes */}
        <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
            </span>
            <span className="text-fluid-xs font-semibold text-mist-100 drop-shadow tracking-wide">
              {titulo}
            </span>
          </div>

          <div className="flex items-center gap-2 pointer-events-auto">
            {/* Botão de Áudio */}
            <button
              onClick={() => setIsMuted((prev) => !prev)}
              aria-label={isMuted ? "Ativar som do vídeo" : "Desativar som"}
              className="p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-lg"
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25M11.25 5.25L6.75 9H3.75a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5h3l4.5 3.75V5.25z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M11.25 5.25L6.75 9H3.75a1.5 1.5 0 00-1.5 1.5v3a1.5 1.5 0 001.5 1.5h3l4.5 3.75V5.25z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

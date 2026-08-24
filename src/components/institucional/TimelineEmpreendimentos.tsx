"use client";

import { useRef } from "react";
import { Camada } from "@/components/motion/Camada";
import Image from "next/image";
import Link from "next/link";import { Map, Home, MapPin } from 'lucide-react';


interface MarcoHistorico {
  ano: string;
  nome: string;
  bairro: string;
  status: string;
  imagem: string;
  destaque: string;
  slug?: string;
}

const HISTORICO_EMPREENDIMENTOS: MarcoHistorico[] = [
  {
    ano: "2016",
    nome: "Reserva Alpha Gran",
    bairro: "Alpha Gran — Alphaville",
    status: "100% Entregue",
    imagem: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=800&auto=format&fit=crop",
    destaque: "Marco de arquitetura biofílica",
    slug: "reserva-alpha-gran",
  },
  {
    ano: "2018",
    nome: "Alvear Alphaville",
    bairro: "18 do Forte — Alphaville",
    status: "100% Entregue",
    imagem: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop",
    destaque: "Studios e residências de alto padrão",
    slug: "alvear-alphaville",
  },
  {
    ano: "2020",
    nome: "Croma Alphaville",
    bairro: "Centro Comercial — Alphaville",
    status: "100% Entregue",
    imagem: "https://images.unsplash.com/photo-1577495508048-b635879837f1?q=80&w=800&auto=format&fit=crop",
    destaque: "Design contemporâneo e vista panorâmica",
    slug: "croma-alphaville",
  },
  {
    ano: "2022",
    nome: "Lumina Tamboré",
    bairro: "Tamboré — Santana de Parnaíba",
    status: "100% Entregue",
    imagem: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=800&auto=format&fit=crop",
    destaque: "Mansões suspensas em meio à mata",
    slug: "lumina-tambore",
  },
  {
    ano: "2024",
    nome: "Canvas Alphaville",
    bairro: "Green Valley — Alphaville",
    status: "Em Obras Avançadas",
    imagem: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
    destaque: "Plantas inteligentes de 82m² a 140m²",
    slug: "canvas-alphaville",
  },
  {
    ano: "2026",
    nome: "Next Horizon Alpha",
    bairro: "Alpha Conde — Alphaville",
    status: "Lançamento Exclusivo",
    imagem: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?q=80&w=800&auto=format&fit=crop",
    destaque: "Penthouse e automação residencial completa",
    slug: "next-horizon-alpha",
  },
];

export function TimelineEmpreendimentos() {
  const sliderRef = useRef<HTMLDivElement>(null);

  const rolarParaEsquerda = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: -320, behavior: "smooth" });
    }
  };

  const rolarParaDireita = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: 320, behavior: "smooth" });
    }
  };

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Cabeçalho da Seção */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-veu/5 border border-linha/10 text-acento-forte text-fluid-xs font-semibold mb-3 backdrop-blur shadow-sm">
              <span> <Home className="inline-block w-5 h-5 align-text-bottom mr-1" />  Nossa trajetória, seu futuro lar</span>
            </div>
            <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-titulo tracking-tight">
              Um legado de excelência e valorização em Alphaville
            </h2>
            <p className="text-fluid-sm text-legenda mt-3">
              Conheça os principais marcos imobiliários que ajudamos a construir e comercializar ao longo dos anos. Toque em qualquer projeto para localizá-lo no mapa.
            </p>
          </div>

          {/* Botões de Navegação do Carrossel */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={rolarParaEsquerda}
              aria-label="Rolar para a esquerda"
              className="p-3 rounded-full bg-superficie/80 hover:bg-brand-500 text-titulo hover:text-white border border-linha/15 backdrop-blur transition-all duration-300 cursor-pointer shadow-lg"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>
            <button
              onClick={rolarParaDireita}
              aria-label="Rolar para a direita"
              className="p-3 rounded-full bg-superficie/80 hover:bg-brand-500 text-titulo hover:text-white border border-linha/15 backdrop-blur transition-all duration-300 cursor-pointer shadow-lg"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Trilha do Carrossel */}
        <div
          ref={sliderRef}
          className="flex gap-6 overflow-x-auto scrollbar-none pb-6 pt-2 snap-x snap-mandatory"
        >
          {HISTORICO_EMPREENDIMENTOS.map((item, index) => (
            <div
              key={item.nome + index}
              className="relative shrink-0 w-[280px] sm:w-[320px] snap-start group"
            >
              {/* Card Vertical Curvo. Cores literais de propósito daqui até o
                  fim do card: a foto cobre o card inteiro (`fill -z-10`) e
                  todo o texto fica sobre ela com um véu escuro por baixo —
                  o contraste é foto-vs-texto, não página-vs-texto, igual ao
                  Hero de empreendimento. */}
              <div className="relative h-[400px] sm:h-[440px] w-full rounded-[36px] overflow-hidden border border-white/15 bg-ink-900/60 shadow-xl transition-transform duration-500 group-hover:-translate-y-2 group-hover:border-brand-400/50 flex flex-col justify-between p-5">
                {/* Eixo X porque o movimento aqui é HORIZONTAL: o carrossel
                    anda de lado, e a camada acompanha o eixo do movimento.
                    `apenasDesktop` — no celular o carrossel já é arrastado
                    com o dedo, e somar deslocamento ao gesto confunde. */}
                <Camada
                  eixo="x"
                  velocidade={0.1}
                  apenasDesktop
                  className="absolute inset-0 -z-10 scale-110"
                >
                  <Image
                    src={item.imagem}
                    alt={item.nome}
                    fill
                    sizes="(max-width: 640px) 280px, 320px"
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                </Camada>

                {/* Gradiente Escuro */}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/50 to-black/30 -z-10" />

                {/* Topo do Card: Tag de Ano */}
                <div className="flex items-center justify-between">
                  <span className="px-3.5 py-1.5 rounded-full bg-brand-500 text-white text-fluid-xs font-bold shadow-md shadow-brand-500/30">
                    {item.ano}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-black/60 text-mist-200 text-[11px] font-medium backdrop-blur border border-white/15">
                    {item.status}
                  </span>
                </div>

                {/* Rodapé do Card com Informações e Link para o Mapa */}
                <div className="space-y-2 pt-4">
                  <h3 className="text-fluid-base font-bold text-mist-50 group-hover:text-brand-300 transition-colors">
                    {item.nome}
                  </h3>
                  <div className="flex items-center gap-1.5 text-fluid-xs text-mist-300">
                    <span> <MapPin className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
                    <span className="truncate">{item.bairro}</span>
                  </div>
                  <p className="text-[11px] text-mist-400 font-light line-clamp-1 border-t border-white/10 pt-2">
                    {item.destaque}
                  </p>

                  <div className="pt-2">
                    <Link
                      href={`/mapa?imovel=${item.slug}`}
                      className="inline-flex items-center justify-center gap-1.5 w-full py-2 rounded-xl bg-white/10 hover:bg-brand-500 text-white text-[11px] font-semibold backdrop-blur border border-white/15 transition-all shadow-md"
                    >
                      <span> <Map className="inline-block w-5 h-5 align-text-bottom mr-1" />  Ver no Mapa Noturno</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";
import type { Empreendimento } from "@/lib/types";
import { STATUS_LABEL, TIPO_LABEL } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { normalizarWhatsapp } from "@/lib/whatsapp";

interface Props {
  imovel: Empreendimento;
  onFechar: () => void;
}

export function CardFlutuanteImovel({ imovel, onFechar }: Props) {
  const foneLimpo = normalizarWhatsapp(imovel.corretor?.whatsapp || "5511972207204") || "5511972207204";
  const textoZap = encodeURIComponent(
    `Olá! Vi o ${imovel.nome} no mapa da Next Home e gostaria de mais informações.`,
  );
  const zapLink = `https://wa.me/${foneLimpo}?text=${textoZap}`;

  return (
    <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-auto sm:w-96 z-[1000] animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-2xl border border-white/15 bg-ink-950/85 p-4 backdrop-blur-xl shadow-2xl shadow-black/80">
        {/* Header do Card com Botão de Fechar */}
        <div className="relative mb-3 overflow-hidden rounded-xl aspect-[16/10] bg-ink-900 border border-white/10">
          {imovel.capa?.url ? (
            <Image
              src={imovel.capa.url}
              alt={imovel.nome}
              fill
              sizes="(max-width: 640px) 100vw, 384px"
              className="object-cover transition-transform duration-500 hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-mist-500 text-fluid-xs">
              Sem foto disponível
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-transparent to-black/30" />

          {/* Badges superiores */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-brand-500/90 text-white backdrop-blur shadow-md">
              {STATUS_LABEL[imovel.status] || imovel.status}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-black/60 text-mist-200 backdrop-blur border border-white/15">
              {TIPO_LABEL[imovel.tipo] || imovel.tipo}
            </span>
          </div>

          <button
            onClick={onFechar}
            aria-label="Fechar detalhes do imóvel"
            className="absolute top-2.5 right-2.5 h-7 w-7 rounded-full bg-black/60 hover:bg-black/90 text-mist-300 hover:text-white flex items-center justify-center backdrop-blur border border-white/20 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Preço sobre a imagem */}
          <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-brand-300 drop-shadow">
                A partir de
              </span>
              <p className="text-fluid-base font-bold text-white drop-shadow">
                {imovel.precoAPartir ? formatarMoedaBRL(imovel.precoAPartir) : "Consulte valores"}
              </p>
            </div>
          </div>
        </div>

        {/* Informações do Imóvel */}
        <div className="space-y-2">
          <div>
            <h4 className="text-fluid-sm font-bold text-mist-50 line-clamp-1">{imovel.nome}</h4>
            <p className="text-fluid-xs text-mist-400 line-clamp-1">
              📍 {imovel.bairro} — {imovel.cidade}
            </p>
            <p className="text-[11px] text-mist-500 truncate mt-0.5">{imovel.endereco}</p>
          </div>

          {/* Ações */}
          <div className="pt-2 flex items-center gap-2">
            <Link
              href={`/empreendimentos/${imovel.slug}`}
              className="flex-1 text-center px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-semibold transition-all shadow-md shadow-brand-500/20"
            >
              Ver Apresentação Completa
            </Link>

            <a
              href={zapLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Falar no WhatsApp"
              aria-label="Falar no WhatsApp"
              className="p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.17 8.17 0 0 1-1.25-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.25 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.79.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.55-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.11-.22-.17-.47-.29Z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

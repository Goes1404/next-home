"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Empreendimento } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";

interface Props {
  imoveis: Empreendimento[];
}

export function ListaImoveisClient({ imoveis }: Props) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const filtrados = imoveis.filter((imovel) => {
    const termo = busca.toLowerCase();
    const bateBusca =
      imovel.nome.toLowerCase().includes(termo) ||
      imovel.bairro.toLowerCase().includes(termo) ||
      imovel.cidade.toLowerCase().includes(termo);

    if (!bateBusca) return false;
    const ehPublicado = imovel.publicado ?? true;
    if (filtroStatus === "todos") return true;
    if (filtroStatus === "publicados") return ehPublicado;
    if (filtroStatus === "rascunhos") return !ehPublicado;
    return imovel.status === filtroStatus;
  });

  return (
    <div className="space-y-6">
      {/* Barra de Busca & Filtros para Celular */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, bairro ou cidade..."
            className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-ink-950 px-4 pl-11 text-fluid-xs sm:text-fluid-sm text-white placeholder:text-mist-500 focus:border-brand-400 focus:outline-none"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-mist-400"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="min-h-[48px] rounded-2xl border border-white/15 bg-ink-950 px-4 text-fluid-xs sm:text-fluid-sm text-white focus:border-brand-400 focus:outline-none cursor-pointer"
        >
          <option value="todos">Todos os Imóveis ({imoveis.length})</option>
          <option value="publicados">Apenas Publicados</option>
          <option value="rascunhos">Apenas Rascunhos</option>
          <option value="lancamento">Lançamentos</option>
          <option value="em_construcao">Em Construção</option>
          <option value="pronto_para_morar">Prontos para Morar</option>
        </select>
      </div>

      {/* Grid de Cards Mobile-First */}
      {filtrados.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-white/15 bg-ink-950/60 space-y-3">
          <span className="text-4xl block">🔍</span>
          <h4 className="text-fluid-base font-bold text-mist-200">Nenhum imóvel encontrado</h4>
          <p className="text-fluid-xs text-mist-500">Tente ajustar o termo de busca ou o filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((imovel) => {
            const precoFormatado = imovel.precoAPartir
              ? formatarMoedaBRL(imovel.precoAPartir)
              : "Sob Consulta";

            return (
              <div
                key={imovel.slug}
                className="rounded-3xl border border-white/10 bg-ink-900/60 overflow-hidden shadow-lg hover:border-white/20 transition-all flex flex-col justify-between"
              >
                {/* Imagem de Capa */}
                <div className="relative aspect-[16/9] bg-ink-950">
                  {imovel.capa?.url ? (
                    <Image
                      src={imovel.capa.url}
                      alt={imovel.nome}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-mist-600 text-fluid-xs font-semibold">
                      Sem Foto de Capa
                    </div>
                  )}

                  {/* Badges Flutuantes */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md ${
                        imovel.publicado ?? true
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      }`}
                    >
                      {imovel.publicado ?? true ? "Publicado" : "Rascunho"}
                    </span>

                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/60 text-white border border-white/20 backdrop-blur-md">
                      {imovel.midias?.length || imovel.galeria?.length || 0} fotos
                    </span>
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-4 sm:p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-fluid-base font-bold text-white leading-tight">
                        {imovel.nome}
                      </h3>
                    </div>
                    <p className="text-fluid-xs text-mist-400">
                      📍 {imovel.bairro}, {imovel.cidade}
                    </p>
                    <p className="text-fluid-xs font-bold text-brand-300 pt-1">
                      A partir de: {precoFormatado}
                    </p>
                  </div>

                  {/* Botões de Ação para Celular */}
                  <div className="pt-2 flex items-center gap-2 border-t border-white/10">
                    <Link
                      href={`/corretor/imoveis/${imovel.slug}`}
                      className="flex-1 min-h-[46px] rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-brand-500/20 active:scale-98"
                    >
                      <span>✏️ Editar Fotos & Dados</span>
                    </Link>

                    <Link
                      href={`/empreendimentos/${imovel.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver na Vitrine Pública"
                      className="min-h-[46px] w-[46px] rounded-xl bg-white/10 hover:bg-white/20 text-mist-200 hover:text-white transition-colors flex items-center justify-center shrink-0"
                    >
                      <span>👁️</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

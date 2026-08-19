"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Empreendimento } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { MapPin } from 'lucide-react';

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
            className="min-h-[48px] w-full rounded-2xl border border-linha-forte bg-campo px-4 pl-11 text-fluid-xs sm:text-fluid-sm text-titulo placeholder:text-tenue focus:border-acento focus:outline-none"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-apoio"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="min-h-[48px] rounded-2xl border border-linha-forte bg-campo px-4 text-fluid-xs sm:text-fluid-sm text-titulo focus:border-acento focus:outline-none cursor-pointer"
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
        <div className="p-12 text-center rounded-3xl border border-dashed border-linha-forte bg-elevado space-y-3">
          <span className="text-4xl block">🔍</span>
          <h4 className="text-fluid-base font-bold text-corpo">Nenhum imóvel encontrado</h4>
          <p className="text-fluid-xs text-tenue">Tente ajustar o termo de busca ou o filtro.</p>
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
                className="rounded-3xl border border-linha bg-superficie overflow-hidden shadow-lg hover:border-linha-forte transition-all flex flex-col justify-between"
              >
                {/* Imagem de Capa */}
                <div className="relative aspect-[16/9] bg-campo">
                  {imovel.capa?.url ? (
                    <Image
                      src={imovel.capa.url}
                      alt={imovel.nome}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-tenue text-fluid-xs font-semibold">
                      Sem Foto de Capa
                    </div>
                  )}

                  {/* Badges Flutuantes */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md ${
                        imovel.publicado ?? true
                          ? "bg-ok-lavado text-ok border-ok-linha"
                          : "bg-alerta-lavado text-alerta border-alerta-linha"
                      }`}
                    >
                      {imovel.publicado ?? true ? "Publicado" : "Rascunho"}
                    </span>

                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-black/60 text-titulo border border-linha-forte backdrop-blur-md">
                      {imovel.midias?.length || imovel.galeria?.length || 0} fotos
                    </span>
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-4 sm:p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-fluid-base font-bold text-titulo leading-tight">
                        {imovel.nome}
                      </h3>
                    </div>
                    <p className="text-fluid-xs text-apoio">
                       <MapPin className="inline-block w-5 h-5 align-text-bottom mr-1" />  {imovel.bairro}, {imovel.cidade}
                    </p>
                    <p className="text-fluid-xs font-bold text-acento-suave pt-1">
                      A partir de: {precoFormatado}
                    </p>
                  </div>

                  {/* Botões de Ação para Celular */}
                  <div className="pt-2 flex items-center gap-2 border-t border-linha">
                    <Link
                      href={`/corretor/imoveis/${imovel.slug}`}
                      className="flex-1 min-h-[46px] rounded-xl bg-acento hover:bg-acento-hover text-white text-fluid-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-acento/20 active:scale-98"
                    >
                      <span>✏️ Editar Fotos & Dados</span>
                    </Link>

                    <Link
                      href={`/empreendimentos/${imovel.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ver na Vitrine Pública"
                      className="min-h-[46px] w-[46px] rounded-xl bg-vidro-forte hover:bg-vidro-mais text-corpo hover:text-titulo transition-colors flex items-center justify-center shrink-0"
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

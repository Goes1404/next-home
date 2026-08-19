import Link from "next/link";
import Image from "next/image";
import type { Empreendimento } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";import { MapPin, Flame } from 'lucide-react';


interface Props {
  empreendimentos: Empreendimento[];
}

export function VitrineOportunidadesSobre({ empreendimentos }: Props) {
  const destaques = empreendimentos.slice(0, 3);
  if (destaques.length === 0) return null;

  return (
    <section className="relative py-16 sm:py-24 border-t border-linha/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-veu/5 border border-linha/10 text-acento-forte text-fluid-xs font-semibold mb-3 backdrop-blur">
              <span> <Flame className="inline-block w-5 h-5 align-text-bottom mr-1" />  Oportunidades Selecionadas</span>
            </div>
            <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-titulo tracking-tight">
              Empreendimentos com unidades disponíveis
            </h2>
            <p className="text-fluid-sm text-legenda mt-2">
              Conheça as opções ativas no nosso portfólio e agende uma apresentação privativa.
            </p>
          </div>

          <Link
            href="/empreendimentos"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-veu/10 hover:bg-veu/15 text-titulo text-fluid-xs font-semibold backdrop-blur border border-linha/15 transition-all self-start sm:self-auto"
          >
            <span>Ver Catálogo Completo</span>
            <span>→</span>
          </Link>
        </div>

        {/* Grid de 3 Colunas de Imóveis */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {destaques.map((imovel) => (
            <div
              key={imovel.slug}
              className="group relative overflow-hidden rounded-[2rem] border border-linha/15 bg-superficie/60 p-4 transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-400/50 shadow-xl"
            >
              {/* Foto de Capa */}
              <div className="relative aspect-[16/11] w-full overflow-hidden rounded-2xl bg-superficie">
                {imovel.capa?.url ? (
                  <Image
                    src={imovel.capa.url}
                    alt={imovel.nome}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-tenue text-fluid-xs">
                    Next Home
                  </div>
                )}
                {/* Véu sobre a foto de capa (não sobre a página), para legibilidade do selo de status. */}
                <div className="absolute inset-0 bg-gradient-to-t from-ink-950/80 via-transparent to-transparent" />

                {/* Status Badge */}
                <div className="absolute top-3 left-3">
                  <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-brand-500 text-white shadow-md">
                    {STATUS_LABEL[imovel.status] || imovel.status}
                  </span>
                </div>
              </div>

              {/* Informações */}
              <div className="pt-4 space-y-2">
                <h3 className="text-fluid-base font-bold text-titulo group-hover:text-acento-forte transition-colors line-clamp-1">
                  {imovel.nome}
                </h3>
                <p className="text-fluid-xs text-legenda">
                   <MapPin className="inline-block w-5 h-5 align-text-bottom mr-1" />  {imovel.bairro} — {imovel.cidade}
                </p>

                <div className="flex items-center justify-between border-t border-linha/10 pt-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-legenda block">
                      A partir de
                    </span>
                    <span className="text-fluid-sm font-bold text-titulo">
                      {imovel.precoAPartir ? formatarMoedaBRL(imovel.precoAPartir) : "Consulte"}
                    </span>
                  </div>

                  <Link
                    href={`/empreendimentos/${imovel.slug}`}
                    className="px-3.5 py-1.5 rounded-lg bg-brand-500/20 hover:bg-brand-500 text-acento-forte hover:text-white text-fluid-xs font-semibold transition-all border border-brand-400/30"
                  >
                    Conhecer
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

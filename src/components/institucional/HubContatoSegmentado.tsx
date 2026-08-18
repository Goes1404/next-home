import Link from "next/link";
import { site, enderecoLinha } from "@/lib/site";

interface Props {
  linkWhatsapp: string;
}

export function HubContatoSegmentado({ linkWhatsapp }: Props) {
  return (
    <section className="relative py-16 sm:py-24 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Lado Esquerdo: Cabeçalho & Canais */}
          <div className="lg:col-span-6 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-brand-300 text-fluid-xs font-semibold backdrop-blur">
              <span>💬 Canais de Atendimento</span>
            </div>
            <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-mist-50 tracking-tight">
              Fale diretamente com nossa equipe especializada
            </h2>
            <p className="text-fluid-sm text-mist-400 font-light">
              Seja para encontrar a residência perfeita em Alphaville, disponibilizar seu imóvel ou fazer parte da nossa rede de corretores parceiros.
            </p>

            <div className="pt-4 flex flex-wrap gap-3">
              <a
                href={linkWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-fluid-sm transition-colors shadow-lg shadow-emerald-900/30"
              >
                <span>Falar no WhatsApp</span>
                <span>→</span>
              </a>

              <Link
                href="/contato"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 hover:bg-white/15 text-mist-100 font-semibold text-fluid-sm transition-colors border border-white/15"
              >
                Formulário de Contato
              </Link>
            </div>
          </div>

          {/* Lado Direito: Grid de Cards Segmentados */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: Comprar */}
            <div className="p-5 rounded-2xl border border-white/10 bg-ink-900/60 backdrop-blur space-y-2">
              <span className="text-2xl block">🏠</span>
              <h4 className="text-fluid-sm font-bold text-white">Quero Comprar ou Investir</h4>
              <p className="text-[12px] text-mist-400">
                Apresentação privativa de lançamentos e oportunidades exclusivas na região.
              </p>
              <a
                href={linkWhatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="text-fluid-xs font-semibold text-brand-300 hover:underline inline-block pt-1"
              >
                Consultar catálogo →
              </a>
            </div>

            {/* Card 2: Anunciar Imóvel */}
            <div className="p-5 rounded-2xl border border-white/10 bg-ink-900/60 backdrop-blur space-y-2">
              <span className="text-2xl block">📈</span>
              <h4 className="text-fluid-sm font-bold text-white">Anunciar meu Imóvel</h4>
              <p className="text-[12px] text-mist-400">
                Divulgação de alto padrão para compradores qualificados com total discrição.
              </p>
              <Link
                href="/anuncie"
                className="text-fluid-xs font-semibold text-brand-300 hover:underline inline-block pt-1"
              >
                Cadastrar imóvel →
              </Link>
            </div>

            {/* Card 3: Parcerias e Corretores */}
            <div className="p-5 rounded-2xl border border-white/10 bg-ink-900/60 backdrop-blur space-y-2">
              <span className="text-2xl block">🤝</span>
              <h4 className="text-fluid-sm font-bold text-white">Seja um Corretor Parceiro</h4>
              <p className="text-[12px] text-mist-400">
                Acesse nossa infraestrutura tecnológica, esteira de leads e catálogo unificado.
              </p>
              <Link
                href="/contato?assunto=parceria"
                className="text-fluid-xs font-semibold text-brand-300 hover:underline inline-block pt-1"
              >
                Fazer parceria →
              </Link>
            </div>

            {/* Card 4: Sede & Endereço */}
            <div className="p-5 rounded-2xl border border-white/10 bg-ink-900/60 backdrop-blur space-y-2">
              <span className="text-2xl block">📍</span>
              <h4 className="text-fluid-sm font-bold text-white">Sede & Atendimento</h4>
              <p className="text-[12px] text-mist-400">
                {enderecoLinha}
              </p>
              <span className="text-[11px] text-mist-500 font-medium block pt-1">
                CRECI {site.creci}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function NossaEssencia() {
  return (
    <section className="relative py-16 sm:py-24 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Cabeçalho */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-brand-300 text-fluid-xs font-semibold mb-3 backdrop-blur">
            <span>✨ Nossa essência</span>
          </div>
          <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-mist-50 tracking-tight">
            Princípios que guiam nossa consultoria de alto padrão
          </h2>
          <p className="text-fluid-sm text-mist-400 mt-3">
            Atendimento exclusivo, curadoria arquitetônica e segurança documental em todas as etapas da sua jornada.
          </p>
        </div>

        {/* Grid Editorial com Divisórias Sutis */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10 border-y border-white/10 py-8">
          {/* Missão */}
          <div className="py-6 md:py-4 px-0 md:px-8 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-400/20 font-bold text-sm">
                01
              </span>
              <h3 className="text-fluid-lg font-bold text-mist-50">Missão</h3>
            </div>
            <p className="text-fluid-sm text-mist-300 leading-relaxed font-light">
              Entender com profundidade o estilo de vida de cada cliente e apresentar apenas empreendimentos com arquitetura impecável, localização nobre e liquidez comprovada em Alphaville e região.
            </p>
          </div>

          {/* Visão */}
          <div className="py-6 md:py-4 px-0 md:px-8 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-400/20 font-bold text-sm">
                02
              </span>
              <h3 className="text-fluid-lg font-bold text-mist-50">Visão</h3>
            </div>
            <p className="text-fluid-sm text-mist-300 leading-relaxed font-light">
              Ser a boutique imobiliária de maior prestígio e recomendação orgânica em Alphaville, reconhecida pela precisão cirúrgica de matchmaking entre famílias, investidores e imóveis extraordinários.
            </p>
          </div>

          {/* Valores */}
          <div className="py-6 md:py-4 px-0 md:px-8 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-400/20 font-bold text-sm">
                03
              </span>
              <h3 className="text-fluid-lg font-bold text-mist-50">Valores</h3>
            </div>
            <p className="text-fluid-sm text-mist-300 leading-relaxed font-light">
              Confidencialidade absoluta, ética inegociável, transparência em todas as tratativas, rigor técnico na análise documental e relacionamento vitalício com nossos clientes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

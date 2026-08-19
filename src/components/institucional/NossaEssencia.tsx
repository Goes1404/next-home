import { Sparkles } from 'lucide-react';
export function NossaEssencia() {
  return (
    <section className="relative py-16 sm:py-24 border-t border-linha/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Cabeçalho */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-veu/5 border border-linha/10 text-acento-forte text-fluid-xs font-semibold mb-3 backdrop-blur">
            <span> <Sparkles className="inline-block w-5 h-5 align-text-bottom mr-1" />  Nosso Compromisso</span>
          </div>
          <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-titulo tracking-tight">
            Princípios que guiam cada negociação e atendimento
          </h2>
          <p className="text-fluid-sm text-legenda mt-3">
            Transparência, agilidade de resposta e as melhores oportunidades imobiliárias para você morar ou investir com total segurança.
          </p>
        </div>

        {/* Grid Editorial com Divisórias Sutis */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-linha/10 border-y border-linha/10 py-8">
          {/* Missão */}
          <div className="py-6 md:py-4 px-0 md:px-8 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-400/20 font-bold text-sm">
                01
              </span>
              <h3 className="text-fluid-lg font-bold text-titulo">Missão</h3>
            </div>
            <p className="text-fluid-sm text-apoio leading-relaxed">
              Entender as necessidades e o momento de vida de cada cliente, apresentando imóveis com alto potencial de valorização, condições facilitadas e negociações justas em toda a região.
            </p>
          </div>

          {/* Visão */}
          <div className="py-6 md:py-4 px-0 md:px-8 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-400/20 font-bold text-sm">
                02
              </span>
              <h3 className="text-fluid-lg font-bold text-titulo">Visão</h3>
            </div>
            <p className="text-fluid-sm text-apoio leading-relaxed">
              Ser a imobiliária de maior confiança e agilidade em Alphaville, Barueri e região, reconhecida por fechar os melhores negócios e gerar valor real para compradores, proprietários e investidores.
            </p>
          </div>

          {/* Valores */}
          <div className="py-6 md:py-4 px-0 md:px-8 space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 border border-brand-400/20 font-bold text-sm">
                03
              </span>
              <h3 className="text-fluid-lg font-bold text-titulo">Valores</h3>
            </div>
            <p className="text-fluid-sm text-apoio leading-relaxed">
              Transparência em cada etapa, agilidade no atendimento, respeito ao orçamento do cliente, segurança jurídica completa e compromisso com o resultado.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

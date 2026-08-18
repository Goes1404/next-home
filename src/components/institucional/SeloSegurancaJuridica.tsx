import { site } from "@/lib/site";

export function SeloSegurancaJuridica() {
  return (
    <section className="relative py-12 sm:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-brand-500/30 bg-gradient-to-br from-brand-950/60 via-ink-950 to-ink-900/90 p-8 sm:p-14 backdrop-blur-2xl shadow-2xl">
          {/* Background Decorative Rings */}
          <div className="absolute top-0 right-0 -mt-16 -mr-16 w-80 h-80 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-16 -ml-16 w-80 h-80 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Texto de Autoridade */}
            <div className="lg:col-span-8 space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-brand-500/20 text-brand-300 text-[11px] font-bold uppercase tracking-wider border border-brand-500/30">
                <span>🛡️ Segurança Patrimonial & Due Diligence</span>
              </div>
              <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-white tracking-tight leading-tight">
                Garantia de conformidade legal e assessoria documental completa
              </h2>
              <p className="text-fluid-sm text-mist-300 leading-relaxed max-w-2xl font-light">
                Com registro oficial sob o <strong className="text-white font-semibold">CRECI Jurídico {site.creci}</strong>, a Next Home submete cada transação imobiliária a um rigoroso processo de auditoria jurídica de certidões, matrículas e contratos, blindando o patrimônio e garantindo tranquilidade absoluta na sua aquisição.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                <div className="flex items-center gap-2.5 text-mist-200 text-fluid-xs">
                  <span className="text-brand-400">✓</span>
                  <span>Auditoria de Matrículas</span>
                </div>
                <div className="flex items-center gap-2.5 text-mist-200 text-fluid-xs">
                  <span className="text-brand-400">✓</span>
                  <span>Certidões Negativas 100%</span>
                </div>
                <div className="flex items-center gap-2.5 text-mist-200 text-fluid-xs">
                  <span className="text-brand-400">✓</span>
                  <span>Minutas Contratuais Claras</span>
                </div>
              </div>
            </div>

            {/* Selo Visual / Badge de Credibilidade */}
            <div className="lg:col-span-4 flex justify-center lg:justify-end">
              <div className="relative flex flex-col items-center justify-center p-8 rounded-3xl border border-white/20 bg-ink-950/80 shadow-2xl backdrop-blur text-center w-full max-w-[280px]">
                <div className="w-16 h-16 rounded-full bg-brand-500/20 border border-brand-400/40 flex items-center justify-center text-2xl mb-3 shadow-inner">
                  🏛️
                </div>
                <span className="text-[11px] uppercase tracking-widest text-brand-300 font-bold">
                  Registro Oficial
                </span>
                <span className="text-fluid-lg font-bold text-white mt-0.5">
                  CRECI {site.creci}
                </span>
                <span className="text-[11px] text-mist-400 mt-2 font-medium">
                  Atuação em Alphaville, Tamboré e Região Metropolitana
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

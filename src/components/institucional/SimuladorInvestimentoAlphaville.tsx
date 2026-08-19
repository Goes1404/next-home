"use client";

import { useMemo, useState } from "react";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { normalizarWhatsapp } from "@/lib/whatsapp";

interface Props {
  corretorWhatsapp?: string;
}

const APORTES_RAPIDOS = [
  { label: "R$ 800k", valor: 800_000 },
  { label: "R$ 1,5M", valor: 1_500_000 },
  { label: "R$ 3M", valor: 3_000_000 },
  { label: "R$ 6M", valor: 6_000_000 },
  { label: "R$ 10M+", valor: 10_000_000 },
];

export function SimuladorInvestimentoAlphaville({
  corretorWhatsapp = "5511972207204",
}: Props) {
  const [valorInvestimento, setValorInvestimento] = useState<number>(1_500_000);
  const [estrategia, setEstrategia] = useState<"planta" | "renda">("planta");
  const [horizonteAnos, setHorizonteAnos] = useState<number>(3);

  // Cálculos baseados no histórico imobiliário de Alphaville / Tamboré
  const calculos = useMemo(() => {
    if (estrategia === "planta") {
      // Valorização na planta: ~9.5% a.a. + salto de entrega de chaves
      const taxaAnual = 0.115;
      const patrimonioFinal = valorInvestimento * Math.pow(1 + taxaAnual, horizonteAnos);
      const ganhoTotal = patrimonioFinal - valorInvestimento;
      const rentabilidadePercentual = ((patrimonioFinal - valorInvestimento) / valorInvestimento) * 100;

      return {
        patrimonioFinal,
        ganhoTotal,
        rentabilidadePercentual: Math.round(rentabilidadePercentual),
        rendaMensalEstimada: 0,
      };
    } else {
      // Estratégia de Renda: 0.58% a.m. de yield + 7% a.a. de valorização do ativo
      const taxaValorizacaoAnual = 0.075;
      const yieldMensal = 0.0058;
      const rendaMensalEstimada = valorInvestimento * yieldMensal;
      const patrimonioFinal = valorInvestimento * Math.pow(1 + taxaValorizacaoAnual, horizonteAnos);
      const totalRendaAcumulada = rendaMensalEstimada * 12 * horizonteAnos;
      const ganhoTotal = patrimonioFinal - valorInvestimento + totalRendaAcumulada;
      const rentabilidadePercentual = (ganhoTotal / valorInvestimento) * 100;

      return {
        patrimonioFinal,
        ganhoTotal,
        rentabilidadePercentual: Math.round(rentabilidadePercentual),
        rendaMensalEstimada,
      };
    }
  }, [valorInvestimento, estrategia, horizonteAnos]);

  // WhatsApp Link personalizado com os dados do simulador
  const fone = normalizarWhatsapp(corretorWhatsapp) || "5511972207204";
  const msgZap = encodeURIComponent(
    `Olá! Fiz uma simulação de investimento de ${formatarMoedaBRL(valorInvestimento)} na Next Home (${estrategia === "planta" ? "Lançamento na Planta" : "Renda de Locação"}) para ${horizonteAnos} anos. Gostaria de receber o estudo completo e as opções disponíveis em Alphaville.`,
  );
  const zapLink = `https://wa.me/${fone}?text=${msgZap}`;

  return (
    <section className="relative py-16 sm:py-24 border-t border-white/10 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Cabeçalho */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-400/30 text-brand-300 text-fluid-xs font-semibold mb-3 backdrop-blur shadow-sm">
            <span>📈 Inteligência Imobiliária & Investimento</span>
          </div>
          <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-titulo tracking-tight">
            Simulador de Valorização & Rentabilidade em Alphaville
          </h2>
          <p className="text-fluid-sm text-legenda mt-3 font-light">
            Projete o potencial de ganho de capital e geração de renda passiva nos bairros de maior liquidez da região.
          </p>
        </div>

        {/* Card do simulador, escuro fixo nos dois temas, de propósito: é uma
            vitrine de marca (glassmorphism, controles e texto branco fixos),
            não uma leitura de página — convertê-lo pediria redesenhar cada
            estado (toggle, slider, resultado), não só trocar token de cor. */}
        <div className="relative rounded-[2.5rem] border border-white/15 bg-gradient-to-b from-ink-900/80 to-ink-950 p-6 sm:p-10 backdrop-blur-2xl shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Controles da Simulação (Esquerda) */}
            <div className="lg:col-span-6 space-y-6">
              {/* Seletor de Estratégia */}
              <div>
                <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block mb-2">
                  Estratégia de Investimento
                </label>
                <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-ink-950 border border-white/10">
                  <button
                    onClick={() => setEstrategia("planta")}
                    className={`py-2.5 px-3 rounded-xl text-fluid-xs font-semibold transition-all cursor-pointer ${
                      estrategia === "planta"
                        ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
                        : "text-mist-400 hover:text-white"
                    }`}
                  >
                    🏗️ Ganho na Planta (Obra)
                  </button>
                  <button
                    onClick={() => setEstrategia("renda")}
                    className={`py-2.5 px-3 rounded-xl text-fluid-xs font-semibold transition-all cursor-pointer ${
                      estrategia === "renda"
                        ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
                        : "text-mist-400 hover:text-white"
                    }`}
                  >
                    🏠 Renda de Aluguel + Ganho
                  </button>
                </div>
              </div>

              {/* Valor do Investimento */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider">
                    Aporte Estimado
                  </label>
                  <span className="text-fluid-lg font-bold text-brand-300">
                    {formatarMoedaBRL(valorInvestimento)}
                  </span>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min={500_000}
                  max={10_000_000}
                  step={100_000}
                  value={valorInvestimento}
                  onChange={(e) => setValorInvestimento(Number(e.target.value))}
                  className="w-full h-2 bg-ink-950 rounded-lg appearance-none cursor-pointer accent-brand-400 border border-white/15"
                />

                {/* Botões de Aporte Rápido */}
                <div className="flex items-center gap-2 mt-3 overflow-x-auto scrollbar-none pb-1">
                  {APORTES_RAPIDOS.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => setValorInvestimento(item.valor)}
                      className={`px-3 py-1.5 rounded-xl text-fluid-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                        valorInvestimento === item.valor
                          ? "border-brand-400 bg-brand-500/20 text-white"
                          : "border-white/10 bg-ink-950 text-mist-400 hover:text-white"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Horizonte de Tempo */}
              <div>
                <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block mb-2">
                  Prazo de Projeção
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 3, 5].map((anos) => (
                    <button
                      key={anos}
                      onClick={() => setHorizonteAnos(anos)}
                      className={`py-2 rounded-xl text-fluid-xs font-semibold border transition-all cursor-pointer ${
                        horizonteAnos === anos
                          ? "border-brand-400 bg-brand-500/20 text-white"
                          : "border-white/10 bg-ink-950 text-mist-400 hover:text-white"
                      }`}
                    >
                      {anos} {anos === 1 ? "Ano" : "Anos"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Resultado Projetado (Direita) */}
            <div className="lg:col-span-6 space-y-4">
              <div className="rounded-3xl border border-brand-500/30 bg-ink-950/90 p-6 sm:p-8 backdrop-blur shadow-xl relative overflow-hidden space-y-6">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 rounded-full bg-brand-500/10 blur-2xl pointer-events-none" />

                <div>
                  <span className="text-[11px] uppercase tracking-wider font-bold text-brand-300 block">
                    Patrimônio Estimado em {horizonteAnos} {horizonteAnos === 1 ? "Ano" : "Anos"}
                  </span>
                  <p className="text-fluid-2xl sm:text-fluid-3xl font-bold text-white tracking-tight mt-1">
                    {formatarMoedaBRL(calculos.patrimonioFinal)}
                  </p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-fluid-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    +{calculos.rentabilidadePercentual}% de Retorno Total Estimado
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-4">
                  <div>
                    <span className="text-[11px] text-mist-400 block font-light">
                      Ganho de Capital Bruto
                    </span>
                    <p className="text-fluid-base font-bold text-mist-100 mt-0.5">
                      +{formatarMoedaBRL(calculos.ganhoTotal)}
                    </p>
                  </div>

                  {estrategia === "renda" && (
                    <div>
                      <span className="text-[11px] text-mist-400 block font-light">
                        Renda Mensal de Aluguel
                      </span>
                      <p className="text-fluid-base font-bold text-emerald-400 mt-0.5">
                        ~{formatarMoedaBRL(calculos.rendaMensalEstimada)}/mês
                      </p>
                    </div>
                  )}

                  {estrategia === "planta" && (
                    <div>
                      <span className="text-[11px] text-mist-400 block font-light">
                        Média Histórica na Região
                      </span>
                      <p className="text-fluid-base font-bold text-brand-300 mt-0.5">
                        ~11,5% ao ano
                      </p>
                    </div>
                  )}
                </div>

                {/* Botão de Ação WhatsApp */}
                <a
                  href={zapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-fluid-xs font-bold transition-all shadow-lg shadow-emerald-900/40 cursor-pointer"
                >
                  <span>Receber Estudo de Oportunidades no WhatsApp</span>
                  <span>→</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

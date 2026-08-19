"use client";

import { useMemo, useState } from "react";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import { Building2, Home, TrendingUp } from "lucide-react";

interface Props {
  corretorWhatsapp?: string;
}

const APORTES_RAPIDOS = [
  { label: "R$ 350k", valor: 350_000 },
  { label: "R$ 600k", valor: 600_000 },
  { label: "R$ 1,2M", valor: 1_200_000 },
  { label: "R$ 2,5M", valor: 2_500_000 },
  { label: "R$ 5M+", valor: 5_000_000 },
];

export function SimuladorInvestimentoAlphaville({
  corretorWhatsapp = "5511972207204",
}: Props) {
  const [valorInvestimento, setValorInvestimento] = useState<number>(600_000);
  const [estrategia, setEstrategia] = useState<"planta" | "renda">("planta");
  const [horizonteAnos, setHorizonteAnos] = useState<number>(3);

  // Cálculos baseados no histórico imobiliário de Alphaville / Tamboré / Barueri
  const calculos = useMemo(() => {
    if (estrategia === "planta") {
      // Valorização na planta: ~11.5% a.a. considerando valorização da obra e entrega
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
      // Estratégia de Renda: yield médio + valorização do ativo
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
    `Olá! Fiz uma simulação de investimento de ${formatarMoedaBRL(valorInvestimento)} na Next Home (${estrategia === "planta" ? "Lançamento na Planta" : "Renda de Aluguel"}) para ${horizonteAnos} anos. Gostaria de receber as melhores oportunidades com essas condições.`,
  );
  const zapLink = `https://wa.me/${fone}?text=${msgZap}`;

  return (
    <section className="relative py-16 sm:py-24 border-t border-white/10 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Cabeçalho */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-500/10 border border-brand-400/30 text-brand-300 text-fluid-xs font-semibold mb-3 backdrop-blur shadow-sm">
            <span> <TrendingUp className="inline-block w-5 h-5 align-text-bottom mr-1" />  Oportunidade & Rentabilidade</span>
          </div>
          <h2 className="text-fluid-2xl sm:text-fluid-3xl font-bold text-titulo tracking-tight">
            Simulador de Valorização & Retorno Imobiliário
          </h2>
          <p className="text-fluid-sm text-legenda mt-3 font-normal">
            Calcule o potencial de ganho do seu patrimônio com lançamentos na planta ou renda passiva de locação na região.
          </p>
        </div>

        <div className="relative rounded-[2.5rem] border border-white/15 bg-gradient-to-b from-ink-900/80 to-ink-950 p-6 sm:p-10 backdrop-blur-2xl shadow-2xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Controles da Simulação (Esquerda) */}
            <div className="lg:col-span-6 space-y-6">
              {/* Seletor de Estratégia */}
              <div>
                <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block mb-2">
                  Objetivo do Investimento
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
                     <Building2 className="inline-block w-5 h-5 align-text-bottom mr-1" />  Comprar na Planta (Ganho de Obra)
                  </button>
                  <button
                    onClick={() => setEstrategia("renda")}
                    className={`py-2.5 px-3 rounded-xl text-fluid-xs font-semibold transition-all cursor-pointer ${
                      estrategia === "renda"
                        ? "bg-brand-500 text-white shadow-md shadow-brand-500/30"
                        : "text-mist-400 hover:text-white"
                    }`}
                  >
                     <Home className="inline-block w-5 h-5 align-text-bottom mr-1" />  Renda de Aluguel + Valorização
                  </button>
                </div>
              </div>

              {/* Valor do Investimento */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider">
                    Valor Pretendido
                  </label>
                  <span className="text-fluid-lg font-bold text-brand-300">
                    {formatarMoedaBRL(valorInvestimento)}
                  </span>
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min={250_000}
                  max={6_000_000}
                  step={50_000}
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
                  Prazo Desejado
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
                      Ganho Estimado de Capital
                    </span>
                    <p className="text-fluid-base font-bold text-mist-100 mt-0.5">
                      +{formatarMoedaBRL(calculos.ganhoTotal)}
                    </p>
                  </div>

                  {estrategia === "renda" && (
                    <div>
                      <span className="text-[11px] text-mist-400 block font-light">
                        Renda Mensal Estimada
                      </span>
                      <p className="text-fluid-base font-bold text-emerald-400 mt-0.5">
                        ~{formatarMoedaBRL(calculos.rendaMensalEstimada)}/mês
                      </p>
                    </div>
                  )}

                  {estrategia === "planta" && (
                    <div>
                      <span className="text-[11px] text-mist-400 block font-light">
                        Valorização Média da Região
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
                  <span>Receber Melhores Oportunidades no WhatsApp</span>
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

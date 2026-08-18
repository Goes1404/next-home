"use client";

import type { Tipologia } from "@/lib/types";

interface Props {
  tipologias: Tipologia[];
  onAdicionar: () => void;
  onRemover: (index: number) => void;
  onChange: (index: number, campo: keyof Tipologia, valor: any) => void;
}

export function EditorTipologias({
  tipologias,
  onAdicionar,
  onRemover,
  onChange,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="p-5 sm:p-6 rounded-3xl border border-white/10 bg-ink-900/60 backdrop-blur space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-fluid-base font-bold text-white">
              📐 Plantas & Metragens Disponíveis
            </h3>
            <p className="text-fluid-xs text-mist-400 mt-0.5">
              Cadastre as diferentes opções de plantas (ex: 82m², 115m², 140m²).
            </p>
          </div>

          <button
            type="button"
            onClick={onAdicionar}
            className="min-h-[48px] px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
          >
            <span>+ Adicionar Nova Planta</span>
          </button>
        </div>

        {tipologias.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-white/15 bg-ink-950/40 space-y-2">
            <span className="text-3xl block">📐</span>
            <p className="text-fluid-xs text-mist-400">
              Nenhuma tipologia cadastrada. Toque no botão acima para adicionar a primeira opção de metragem.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tipologias.map((tip, index) => (
              <div
                key={tip.id || index}
                className="p-4 sm:p-5 rounded-2xl border border-white/10 bg-ink-950/80 space-y-4 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-fluid-xs font-bold text-brand-300">
                    Opção {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemover(index)}
                    className="text-red-400 hover:text-red-300 text-fluid-xs font-semibold px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-mist-400 uppercase">
                      Nome / Metragem
                    </label>
                    <input
                      type="text"
                      value={tip.nome}
                      onChange={(e) => onChange(index, "nome", e.target.value)}
                      placeholder="Ex: 140m² — 3 Suítes"
                      className="min-h-[44px] w-full rounded-xl border border-white/15 bg-ink-900 px-3 text-fluid-xs text-white focus:border-brand-400 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-mist-400 uppercase">
                      Dormitórios / Suítes
                    </label>
                    <input
                      type="number"
                      value={tip.suites}
                      onChange={(e) => onChange(index, "suites", Number(e.target.value))}
                      placeholder="3"
                      className="min-h-[44px] w-full rounded-xl border border-white/15 bg-ink-900 px-3 text-fluid-xs text-white focus:border-brand-400 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-mist-400 uppercase">
                      Vagas de Garagem
                    </label>
                    <input
                      type="number"
                      value={tip.vagas}
                      onChange={(e) => onChange(index, "vagas", Number(e.target.value))}
                      placeholder="2"
                      className="min-h-[44px] w-full rounded-xl border border-white/15 bg-ink-900 px-3 text-fluid-xs text-white focus:border-brand-400 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-mist-400 uppercase">
                      Preço Desta Planta (R$)
                    </label>
                    <input
                      type="number"
                      value={tip.preco ?? ""}
                      onChange={(e) => onChange(index, "preco", e.target.value ? Number(e.target.value) : null)}
                      placeholder="1850000"
                      className="min-h-[44px] w-full rounded-xl border border-white/15 bg-ink-900 px-3 text-fluid-xs text-white focus:border-brand-400 focus:outline-none font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-mist-400 uppercase">
                      Link / Imagem da Planta (URL)
                    </label>
                    <input
                      type="text"
                      value={tip.plantaUrl ?? ""}
                      onChange={(e) => onChange(index, "plantaUrl", e.target.value || null)}
                      placeholder="https://..."
                      className="min-h-[44px] w-full rounded-xl border border-white/15 bg-ink-900 px-3 text-fluid-xs text-white focus:border-brand-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

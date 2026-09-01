"use client";

import type { Tipologia } from "@/lib/types";
import { Ruler } from 'lucide-react';

interface Props {
  tipologias: Tipologia[];
  onAdicionar: () => void;
  onRemover: (index: number) => void;
  /*
   * O valor é o do PRÓPRIO campo, não `any`: com `K extends keyof
   * Tipologia`, passar um texto onde a tipologia espera número passa a ser
   * erro de compilação em vez de defeito em produção.
   */
  onChange: <K extends keyof Tipologia>(index: number, campo: K, valor: Tipologia[K]) => void;
}

export function EditorTipologias({
  tipologias,
  onAdicionar,
  onRemover,
  onChange,
}: Props) {
  return (
    <div className="space-y-6">
      <div className="p-5 sm:p-6 rounded-3xl border border-linha bg-superficie backdrop-blur space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-linha pb-4">
          <div>
            <h3 className="text-fluid-base font-bold text-titulo">
               <Ruler className="inline-block w-5 h-5 align-text-bottom mr-1" />  Plantas & Metragens Disponíveis
            </h3>
            <p className="text-fluid-xs text-apoio mt-0.5">
              Cadastre as diferentes opções de plantas (ex: 82m², 115m², 140m²).
            </p>
          </div>

          <button
            type="button"
            onClick={onAdicionar}
            className="min-h-[48px] px-5 py-2 rounded-xl bg-acento hover:bg-acento-hover text-white text-fluid-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
          >
            <span>+ Adicionar Nova Planta</span>
          </button>
        </div>

        {tipologias.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-dashed border-linha-forte bg-elevado space-y-2">
            <span className="text-3xl block"> <Ruler className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
            <p className="text-fluid-xs text-apoio">
              Nenhuma tipologia cadastrada. Toque no botão acima para adicionar a primeira opção de metragem.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {tipologias.map((tip, index) => (
              <div
                key={tip.id || index}
                className="p-4 sm:p-5 rounded-2xl border border-linha bg-fundo/80 space-y-4 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-fluid-xs font-bold text-acento-suave">
                    Opção {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemover(index)}
                    className="text-perigo hover:text-perigo text-fluid-xs font-semibold px-2.5 py-1 rounded-lg bg-perigo-lavado hover:opacity-85 cursor-pointer"
                  >
                    Excluir
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">
                      Nome / Metragem
                    </label>
                    <input
                      type="text"
                      value={tip.nome}
                      onChange={(e) => onChange(index, "nome", e.target.value)}
                      placeholder="Ex: 140m² — 3 Suítes"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">
                      Dormitórios / Suítes
                    </label>
                    <input
                      type="number"
                      value={tip.suites}
                      onChange={(e) => onChange(index, "suites", Number(e.target.value))}
                      placeholder="3"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">
                      Vagas de Garagem
                    </label>
                    <input
                      type="number"
                      value={tip.vagas}
                      onChange={(e) => onChange(index, "vagas", Number(e.target.value))}
                      placeholder="2"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">
                      Preço Desta Planta (R$)
                    </label>
                    <input
                      type="number"
                      value={tip.preco ?? ""}
                      onChange={(e) => onChange(index, "preco", e.target.value ? Number(e.target.value) : null)}
                      placeholder="1850000"
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none font-mono"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-bold text-apoio uppercase">
                      Link / Imagem da Planta (URL)
                    </label>
                    <input
                      type="text"
                      value={tip.plantaUrl ?? ""}
                      onChange={(e) => onChange(index, "plantaUrl", e.target.value || null)}
                      placeholder="https://..."
                      className="min-h-[44px] w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
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

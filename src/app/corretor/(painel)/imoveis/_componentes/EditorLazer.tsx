"use client";

import { useState } from "react";import { Shield, Zap, Check } from 'lucide-react';


const ITENS_LAZER_SUGERIDOS = [
  { nome: "Piscina com Raia / Borda Infinita", icone: "🏊‍♂️" },
  { nome: "Varanda Gourmet com Churrasqueira", icone: "🥩" },
  { nome: "Fitness Center / Academia Equipada", icone: "🏋️‍♂️" },
  { nome: "Quadra de Beach Tennis / Tênis", icone: "🎾" },
  { nome: "Pet Place & Pet Care", icone: "🐾" },
  { nome: "Coworking & Espaço Business", icone: "💼" },
  { nome: "SPA com Sauna & Salas de Massagem", icone: "🧖‍♀️" },
  { nome: "Brinquedoteca & Playground", icone: "🧸" },
  { nome: "Ponto de Recarga para Carro Elétrico", icone: <Zap className="w-4 h-4" /> },
  { nome: "Bosque Privativo & Pista de Cooper", icone: "🌳" },
  { nome: "Salão de Festas Lounge & Espaço Gourmet", icone: "🥂" },
  { nome: "Adega Climatizada", icone: "🍷" },
  { nome: "Bicicletário com Oficina", icone: "🚲" },
  { nome: "Guarita Blindada 24h & Biometria", icone: <Shield className="w-4 h-4" /> },
  { nome: "Rooftop com Vista Panorâmica", icone: "🌇" },
];

interface Props {
  lazerSelecionado: string[];
  onToggle: (nome: string) => void;
}

export function EditorLazer({ lazerSelecionado, onToggle }: Props) {
  const [novoItem, setNovoItem] = useState("");

  const handleAdicionarCustom = () => {
    if (!novoItem.trim()) return;
    onToggle(novoItem.trim());
    setNovoItem("");
  };

  return (
    <div className="space-y-6">
      <div className="p-5 sm:p-6 rounded-3xl border border-linha bg-superficie backdrop-blur space-y-4">
        <div>
          <h3 className="text-fluid-base font-bold text-titulo">
            🏊‍♂️ Lazer, Conforto & Diferenciais do Imóvel
          </h3>
          <p className="text-fluid-xs text-apoio mt-1">
            Toque nos chips abaixo para ativar ou desativar as características na página do imóvel.
          </p>
        </div>

        {/* Grade de Chips Grandes para Toque no Celular */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
          {ITENS_LAZER_SUGERIDOS.map((item) => {
            const ativo = lazerSelecionado.some(
              (l) => l.toLowerCase() === item.nome.toLowerCase() || item.nome.toLowerCase().includes(l.toLowerCase()),
            );
            return (
              <button
                key={item.nome}
                type="button"
                onClick={() => onToggle(item.nome)}
                className={`p-3.5 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer min-h-[52px] active:scale-98 ${
                  ativo
                    ? "bg-acento-lavado border-acento-linha text-acento-suave"
                    : "bg-fundo/80 border-linha text-apoio hover:border-linha-forte hover:text-titulo"
                }`}
              >
                <span className="text-xl shrink-0">{item.icone}</span>
                <span className="text-fluid-xs font-semibold flex-1 leading-snug">{item.nome}</span>
                <span
                  className={`h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${
                    ativo
                      ? "bg-acento border-acento-linha text-white"
                      : "border-linha-forte text-transparent"
                  }`}
                >
                   <Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> 
                </span>
              </button>
            );
          })}
        </div>

        {/* Adicionar Característica Customizada */}
        <div className="pt-4 border-t border-linha flex items-center gap-2">
          <input
            type="text"
            value={novoItem}
            onChange={(e) => setNovoItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdicionarCustom()}
            placeholder="Outro diferencial (ex: Gerador full para 100% das unidades)..."
            className="min-h-[48px] flex-1 rounded-xl border border-linha-forte bg-campo px-4 text-fluid-xs text-titulo focus:border-acento focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAdicionarCustom}
            className="min-h-[48px] px-5 rounded-xl bg-vidro-forte hover:bg-acento text-white text-fluid-xs font-bold transition-colors cursor-pointer"
          >
            + Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}

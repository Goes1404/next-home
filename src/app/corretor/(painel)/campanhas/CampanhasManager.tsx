"use client";

import { useState } from "react";
import type { Empreendimento } from "@/lib/types";

interface Props {
  empreendimentos: Empreendimento[];
}

interface CampanhaMock {
  id: string;
  titulo: string;
  imovelNome: string;
  totalLeads: number;
  enviados: number;
  respondidos: number;
  status: "em_andamento" | "concluida" | "pausada";
  data: string;
}

export function CampanhasManager({ empreendimentos }: Props) {
  const [titulo, setTitulo] = useState("");
  const [imovelSelecionado, setImovelSelecionado] = useState(empreendimentos[0]?.nome || "");
  const [filtroLeads, setFiltroLeads] = useState("parados_15d");
  const [mensagemBase, setMensagemBase] = useState(
    "Olá, {nome}! Tudo bem? Lembrei do seu interesse em Alphaville. Acabou de sair uma condição exclusiva na tabela do {imovel}. Gostaria de receber o book digital?",
  );
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [previewMensagens, setPreviewMensagens] = useState<string[]>([]);
  const [campanhas, setCampanhas] = useState<CampanhaMock[]>([
    {
      id: "camp-1",
      titulo: "Reativação Lançamento Canvas",
      imovelNome: "Canvas Alphaville",
      totalLeads: 48,
      enviados: 48,
      respondidos: 19,
      status: "concluida",
      data: "Ontem às 14:30",
    },
    {
      id: "camp-2",
      titulo: "Oportunidades Prontas para Morar",
      imovelNome: "Lumina Tamboré",
      totalLeads: 25,
      enviados: 12,
      respondidos: 4,
      status: "em_andamento",
      data: "Hoje às 10:00",
    },
  ]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const gerarPreviewIA = () => {
    setGerandoPreview(true);
    setTimeout(() => {
      setGerandoPreview(false);
      setPreviewMensagens([
        `Olá Dr. Marcos! Tudo bem? Lembrei que você buscava 3 suítes em Alphaville. A incorporadora liberou 2 unidades com condição especial no ${imovelSelecionado}. Quer dar uma olhada na planta?`,
        `Oi Fernanda, como vai? Lembrei do seu interesse em condomínios de alto padrão na região. Surgiu uma oportunidade imperdível no ${imovelSelecionado}. Posso te enviar o material?`,
        `Olá Rodrigo! Passando para te atualizar sobre o ${imovelSelecionado}: entraram novas condições de pagamento nesta semana. Gostaria de receber o resumo?`,
      ]);
    }, 600);
  };

  const iniciarDisparo = () => {
    if (!titulo.trim()) {
      alert("Por favor, dê um título para a campanha.");
      return;
    }

    const nova: CampanhaMock = {
      id: `camp-${Date.now()}`,
      titulo,
      imovelNome: imovelSelecionado,
      totalLeads: 32,
      enviados: 1,
      respondidos: 0,
      status: "em_andamento",
      data: "Agora mesmo",
    };

    setCampanhas([nova, ...campanhas]);
    setTitulo("");
    setPreviewMensagens([]);
    setFeedback("Campanha iniciada com sucesso! Os envios seguirão a fila com delay seguro de 30-75s.");
    setTimeout(() => setFeedback(null), 5000);
  };

  return (
    <div className="space-y-8">
      {/* Banner de Feedback */}
      {feedback && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-fluid-xs font-semibold text-emerald-300 backdrop-blur animate-in fade-in duration-200">
          ✓ {feedback}
        </div>
      )}

      {/* 1. Criador de Campanhas */}
      <div className="rounded-3xl border border-white/10 bg-ink-900/60 p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
        <div>
          <span className="text-[11px] uppercase font-bold tracking-wider text-brand-300">
            Reativação Ativa & Inteligente
          </span>
          <h2 className="text-fluid-lg font-bold text-mist-50">
            Criar Nova Campanha de WhatsApp
          </h2>
          <p className="text-fluid-xs text-mist-400 mt-1">
            Selecione uma base de leads, escolha o empreendimento e deixe a IA gerar abordagens personalizadas e seguras.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Título da Campanha */}
          <div className="space-y-2">
            <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block">
              Título da Campanha
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Reativação de Clientes — Lançamento Alpha"
              className="w-full rounded-xl border border-white/15 bg-ink-950 px-4 py-2.5 text-fluid-sm text-mist-50 focus:border-brand-400 focus:outline-none"
            />
          </div>

          {/* Empreendimento em Destaque */}
          <div className="space-y-2">
            <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block">
              Empreendimento Foco
            </label>
            <select
              value={imovelSelecionado}
              onChange={(e) => setImovelSelecionado(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-ink-950 px-4 py-2.5 text-fluid-sm text-mist-50 focus:border-brand-400 focus:outline-none cursor-pointer"
            >
              {empreendimentos.map((emp) => (
                <option key={emp.slug} value={emp.nome}>
                  {emp.nome} ({emp.bairro})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filtro de Leads Alvo */}
        <div className="space-y-2">
          <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block">
            Público-Alvo (Filtro da Base no CRM)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setFiltroLeads("parados_15d")}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                filtroLeads === "parados_15d"
                  ? "border-brand-400 bg-brand-500/15 text-white"
                  : "border-white/10 bg-ink-950 text-mist-400 hover:text-white"
              }`}
            >
              <h4 className="text-fluid-xs font-bold">⏱️ Parados há +15 dias</h4>
              <p className="text-[11px] text-mist-400 mt-0.5">Leads sem interação recente</p>
            </button>

            <button
              type="button"
              onClick={() => setFiltroLeads("novos_sem_contato")}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                filtroLeads === "novos_sem_contato"
                  ? "border-brand-400 bg-brand-500/15 text-white"
                  : "border-white/10 bg-ink-950 text-mist-400 hover:text-white"
              }`}
            >
              <h4 className="text-fluid-xs font-bold">📥 Novos Leads</h4>
              <p className="text-[11px] text-mist-400 mt-0.5">Etapa &quot;Novo lead&quot; no funil</p>
            </button>

            <button
              type="button"
              onClick={() => setFiltroLeads("todos")}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                filtroLeads === "todos"
                  ? "border-brand-400 bg-brand-500/15 text-white"
                  : "border-white/10 bg-ink-950 text-mist-400 hover:text-white"
              }`}
            >
              <h4 className="text-fluid-xs font-bold">👥 Todos os Meus Leads</h4>
              <p className="text-[11px] text-mist-400 mt-0.5">Toda a carteira ativa</p>
            </button>
          </div>
        </div>

        {/* Mensagem Base */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider">
              Mensagem Base (A IA reescreverá para cada lead)
            </label>
            <span className="text-[11px] text-brand-300 font-mono">Tags: &#123;nome&#125;, &#123;imovel&#125;</span>
          </div>
          <textarea
            rows={3}
            value={mensagemBase}
            onChange={(e) => setMensagemBase(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-ink-950 p-3.5 text-fluid-sm text-mist-50 focus:border-brand-400 focus:outline-none"
          />
        </div>

        {/* Botão de Preview e Disparo */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2 text-[11px] text-mist-400">
            <span className="text-emerald-400">🛡️ Proteção Anti-Ban:</span>
            <span>Envio com delay dinâmico de 30 a 75 segundos.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={gerarPreviewIA}
              disabled={gerandoPreview}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-mist-100 text-fluid-xs font-semibold transition-colors border border-white/15 cursor-pointer"
            >
              {gerandoPreview ? "Gerando Variações..." : "👁️ Ver Variações da IA"}
            </button>
            <button
              onClick={iniciarDisparo}
              className="px-6 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-bold transition-all shadow-md shadow-brand-500/20 cursor-pointer"
            >
              🚀 Iniciar Campanha Segura
            </button>
          </div>
        </div>

        {/* Preview das Variações da IA */}
        {previewMensagens.length > 0 && (
          <div className="space-y-3 p-5 rounded-2xl border border-brand-500/30 bg-ink-950/80 animate-in fade-in duration-300">
            <h4 className="text-fluid-xs font-bold text-brand-300">
              Exemplos de Mensagens Personalizadas Geradas pela IA:
            </h4>
            <div className="space-y-2 text-fluid-xs text-mist-200">
              {previewMensagens.map((msg, i) => (
                <div key={i} className="p-3 rounded-xl bg-ink-900 border border-white/10 font-light">
                  <span className="font-bold text-mist-400 mr-2">Exemplo {i + 1}:</span>
                  &quot;{msg}&quot;
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Histórico e Monitoramento de Campanhas */}
      <div className="rounded-3xl border border-white/10 bg-ink-900/60 p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
        <div>
          <h3 className="text-fluid-base font-bold text-mist-50">Histórico de Campanhas</h3>
          <p className="text-fluid-xs text-mist-400">
            Acompanhe o andamento da fila de envios e a taxa de resposta dos clientes.
          </p>
        </div>

        <div className="divide-y divide-white/10">
          {campanhas.map((c) => {
            const perc = Math.round((c.enviados / c.totalLeads) * 100);
            return (
              <div key={c.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-fluid-sm font-bold text-white">{c.titulo}</h4>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        c.status === "concluida"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse"
                      }`}
                    >
                      {c.status === "concluida" ? "Concluída" : "Enviando Fila"}
                    </span>
                  </div>
                  <p className="text-fluid-xs text-mist-400">
                    🏢 {c.imovelNome} • {c.data}
                  </p>
                </div>

                <div className="flex items-center gap-6 text-fluid-xs text-mist-300">
                  <div>
                    <span className="text-mist-500 block text-[10px]">Progresso</span>
                    <span className="font-bold text-white">
                      {c.enviados}/{c.totalLeads} ({perc}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-mist-500 block text-[10px]">Respostas</span>
                    <span className="font-bold text-emerald-400">
                      {c.respondidos} leads ({Math.round((c.respondidos / (c.enviados || 1)) * 100)}%)
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

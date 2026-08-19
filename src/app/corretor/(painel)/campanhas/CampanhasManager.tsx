"use client";

import { useState } from "react";
import type { Empreendimento } from "@/lib/types";
import { Shield, Building, Download, Rocket, Check } from 'lucide-react';

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
        <div className="rounded-2xl border border-ok-linha bg-ok-lavado p-4 text-fluid-xs font-semibold text-ok backdrop-blur duration-200">
           <Check className="inline-block w-5 h-5 align-text-bottom mr-1" />  {feedback}
        </div>
      )}

      {/* 1. Criador de Campanhas */}
      <div className="rounded-3xl border border-linha bg-superficie p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
        <div>
          <span className="text-[11px] uppercase font-bold tracking-wider text-acento-suave">
            Reativação Ativa & Inteligente
          </span>
          <h2 className="text-fluid-lg font-bold text-titulo">
            Criar Nova Campanha de WhatsApp
          </h2>
          <p className="text-fluid-xs text-apoio mt-1">
            Selecione uma base de leads, escolha o empreendimento e deixe a IA gerar abordagens personalizadas e seguras.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Título da Campanha */}
          <div className="space-y-2">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Título da Campanha
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Reativação de Clientes — Lançamento Alpha"
              className="w-full rounded-xl border border-linha-forte bg-campo px-4 py-2.5 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
            />
          </div>

          {/* Empreendimento em Destaque */}
          <div className="space-y-2">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
              Empreendimento Foco
            </label>
            <select
              value={imovelSelecionado}
              onChange={(e) => setImovelSelecionado(e.target.value)}
              className="w-full rounded-xl border border-linha-forte bg-campo px-4 py-2.5 text-fluid-sm text-titulo focus:border-acento focus:outline-none cursor-pointer"
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
          <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
            Público-Alvo (Filtro da Base no CRM)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setFiltroLeads("parados_15d")}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                filtroLeads === "parados_15d"
                  ? "border-acento-linha bg-acento-lavado text-white"
                  : "border-linha bg-campo text-apoio hover:text-titulo"
              }`}
            >
              <h4 className="text-fluid-xs font-bold">⏱️ Parados há +15 dias</h4>
              <p className="text-[11px] text-apoio mt-0.5">Leads sem interação recente</p>
            </button>

            <button
              type="button"
              onClick={() => setFiltroLeads("novos_sem_contato")}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                filtroLeads === "novos_sem_contato"
                  ? "border-acento-linha bg-acento-lavado text-white"
                  : "border-linha bg-campo text-apoio hover:text-titulo"
              }`}
            >
              <h4 className="text-fluid-xs font-bold"> <Download className="inline-block w-5 h-5 align-text-bottom mr-1" />  Novos Leads</h4>
              <p className="text-[11px] text-apoio mt-0.5">Etapa &quot;Novo lead&quot; no funil</p>
            </button>

            <button
              type="button"
              onClick={() => setFiltroLeads("todos")}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                filtroLeads === "todos"
                  ? "border-acento-linha bg-acento-lavado text-white"
                  : "border-linha bg-campo text-apoio hover:text-titulo"
              }`}
            >
              <h4 className="text-fluid-xs font-bold">👥 Todos os Meus Leads</h4>
              <p className="text-[11px] text-apoio mt-0.5">Toda a carteira ativa</p>
            </button>
          </div>
        </div>

        {/* Mensagem Base */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider">
              Mensagem Base (A IA reescreverá para cada lead)
            </label>
            <span className="text-[11px] text-acento-suave font-mono">Tags: &#123;nome&#125;, &#123;imovel&#125;</span>
          </div>
          <textarea
            rows={3}
            value={mensagemBase}
            onChange={(e) => setMensagemBase(e.target.value)}
            className="w-full rounded-xl border border-linha-forte bg-campo p-3.5 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
          />
        </div>

        {/* Botão de Preview e Disparo */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha pt-4">
          <div className="flex items-center gap-2 text-[11px] text-apoio">
            <span className="text-ok"> <Shield className="inline-block w-5 h-5 align-text-bottom mr-1" />  Proteção Anti-Ban:</span>
            <span>Envio com delay dinâmico de 30 a 75 segundos.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={gerarPreviewIA}
              disabled={gerandoPreview}
              className="px-4 py-2 rounded-xl bg-vidro-forte hover:bg-vidro-mais text-titulo text-fluid-xs font-semibold transition-colors border border-linha-forte cursor-pointer"
            >
              {gerandoPreview ? "Gerando Variações..." : "👁️ Ver Variações da IA"}
            </button>
            <button
              onClick={iniciarDisparo}
              className="px-6 py-2 rounded-xl bg-acento hover:bg-acento-hover text-white text-fluid-xs font-bold transition-all shadow-md shadow-acento/20 cursor-pointer"
            >
               <Rocket className="inline-block w-5 h-5 align-text-bottom mr-1" />  Iniciar Campanha Segura
            </button>
          </div>
        </div>

        {/* Preview das Variações da IA */}
        {previewMensagens.length > 0 && (
          <div className="space-y-3 p-5 rounded-2xl border border-acento-linha bg-fundo/80 duration-300">
            <h4 className="text-fluid-xs font-bold text-acento-suave">
              Exemplos de Mensagens Personalizadas Geradas pela IA:
            </h4>
            <div className="space-y-2 text-fluid-xs text-corpo">
              {previewMensagens.map((msg, i) => (
                <div key={i} className="p-3 rounded-xl bg-superficie border border-linha font-light">
                  <span className="font-bold text-apoio mr-2">Exemplo {i + 1}:</span>
                  &quot;{msg}&quot;
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Histórico e Monitoramento de Campanhas */}
      <div className="rounded-3xl border border-linha bg-superficie p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
        <div>
          <h3 className="text-fluid-base font-bold text-titulo">Histórico de Campanhas</h3>
          <p className="text-fluid-xs text-apoio">
            Acompanhe o andamento da fila de envios e a taxa de resposta dos clientes.
          </p>
        </div>

        <div className="divide-y divide-linha">
          {campanhas.map((c) => {
            const perc = Math.round((c.enviados / c.totalLeads) * 100);
            return (
              <div key={c.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-fluid-sm font-bold text-titulo">{c.titulo}</h4>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        c.status === "concluida"
                          ? "bg-ok-lavado border-ok-linha text-ok"
                          : "bg-alerta-lavado border-alerta-linha text-alerta animate-pulse"
                      }`}
                    >
                      {c.status === "concluida" ? "Concluída" : "Enviando Fila"}
                    </span>
                  </div>
                  <p className="text-fluid-xs text-apoio">
                     <Building className="inline-block w-5 h-5 align-text-bottom mr-1" />  {c.imovelNome} • {c.data}
                  </p>
                </div>

                <div className="flex items-center gap-6 text-fluid-xs text-corpo">
                  <div>
                    <span className="text-tenue block text-[10px]">Progresso</span>
                    <span className="font-bold text-titulo">
                      {c.enviados}/{c.totalLeads} ({perc}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-tenue block text-[10px]">Respostas</span>
                    <span className="font-bold text-ok">
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

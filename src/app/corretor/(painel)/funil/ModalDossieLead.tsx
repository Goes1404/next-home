"use client";

import { useState } from "react";
import type { Lead } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { linkWhatsappLead } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { Smartphone, MessageCircle, Bot, Flame, Check, ArrowRight } from 'lucide-react';

interface Props {
  lead: Lead | null;
  onFechar: () => void;
}

export function ModalDossieLead({ lead, onFechar }: Props) {
  const [aba, setAba] = useState<"dossie" | "chat">("dossie");
  const [botAtivo, setBotAtivo] = useState(true);

  if (!lead) return null;

  const msg = lead.mensagem || "";
  const temFilhos = msg.toLowerCase().includes("filho") || msg.toLowerCase().includes("escola");
  const orcamentoEstimado = 1850000;
  const temperaturaScore = lead.etapa === "visita_agendada" || lead.etapa === "proposta_enviada" ? 92 : 65;
  const isQuente = temperaturaScore >= 75;
  const linkWhatsapp = linkWhatsappLead(lead);

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-3xl border border-acento-linha bg-campo p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-linha pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-acento-lavado text-acento-suave border border-acento-linha">
                 <Bot className="inline-block w-5 h-5 align-text-bottom mr-1" />  Inteligência Artificial do Lead
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  isQuente
                    ? "bg-ok-lavado border-ok-linha text-ok"
                    : "bg-alerta-lavado border-alerta-linha text-alerta"
                }`}
              >
                {isQuente ? <><Flame className="inline-block w-5 h-5 align-text-bottom mr-1" /> Lead Quente (Score 92/100)</> : "🟡 Lead em Qualificação (Score 65/100)"}
              </span>
            </div>
            <h3 className="text-fluid-lg font-bold text-titulo">{lead.nome}</h3>
            <p className="text-fluid-xs text-apoio">
               <Smartphone className="inline-block w-5 h-5 align-text-bottom mr-1" />  {lead.telefone || "Telefone não informado"} • {lead.email || "E-mail não informado"}
            </p>
          </div>

          <button
            onClick={onFechar}
            aria-label="Fechar modal"
            className="p-2 rounded-full bg-vidro-forte hover:bg-vidro-mais text-corpo hover:text-titulo transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Abas do Modal */}
        <div className="flex items-center justify-between border-b border-linha pb-2">
          <div className="flex gap-2">
            <button
              onClick={() => setAba("dossie")}
              className={`px-4 py-2 rounded-xl text-fluid-xs font-bold transition-all cursor-pointer ${
                aba === "dossie"
                  ? "bg-acento text-white shadow-md"
                  : "bg-vidro text-apoio hover:text-titulo"
              }`}
            >
              📊 Dossiê Executivo
            </button>
            <button
              onClick={() => setAba("chat")}
              className={`px-4 py-2 rounded-xl text-fluid-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                aba === "chat"
                  ? "bg-acento text-white shadow-md"
                  : "bg-vidro text-apoio hover:text-titulo"
              }`}
            >
              <span> <MessageCircle className="inline-block w-5 h-5 align-text-bottom mr-1" />  Conversa no WhatsApp</span>
              <span className="h-2 w-2 rounded-full bg-ok animate-pulse" />
            </button>
          </div>

          {/* Toggle de Pausa da IA */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-apoio font-medium">IA nesta conversa:</span>
            <button
              onClick={() => setBotAtivo(!botAtivo)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                botAtivo
                  ? "bg-ok-lavado text-ok border-ok-linha"
                  : "bg-alerta-lavado text-alerta border-alerta-linha"
              }`}
            >
              {botAtivo ? "🟢 Ativa (IA respondendo)" : "⏸️ Pausada (Atendimento Humano)"}
            </button>
          </div>
        </div>

        {/* ABA 1: DOSSIÊ EXECUTIVO */}
        {aba === "dossie" && (
          <div className="space-y-6 duration-200">
            {/* Resumo em Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-linha bg-superficie space-y-1">
                <span className="text-fluid-xs font-bold text-acento-suave">💰 Orçamento & Pagamento</span>
                <p className="text-fluid-sm font-bold text-titulo">
                  ~{formatarMoedaBRL(orcamentoEstimado)}
                </p>
                <p className="text-[11px] text-apoio font-light">
                  Recursos próprios + Financiamento bancário pré-aprovado.
                </p>
              </div>

              <div className="p-4 rounded-2xl border border-linha bg-superficie space-y-1">
                <span className="text-fluid-xs font-bold text-acento-suave">👨‍👩‍👧 Perfil Familiar</span>
                <p className="text-fluid-sm font-bold text-titulo">
                  {temFilhos ? "Casal com Filhos em Idade Escolar" : "Casal / Investidor de Alto Padrão"}
                </p>
                <p className="text-[11px] text-apoio font-light">
                  Busca Alphaville por segurança, lazer completo e escolas internacionais.
                </p>
              </div>
            </div>

            {/* Exigências */}
            <div className="space-y-2">
              <h4 className="text-fluid-xs font-bold text-corpo uppercase tracking-wider">
                Exigências Identificadas pela IA
              </h4>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 rounded-xl bg-vidro border border-linha text-corpo text-fluid-xs">
                   <Check className="inline-block w-5 h-5 align-text-bottom mr-1" />  Andar alto com vista livre
                </span>
                <span className="px-3 py-1 rounded-xl bg-vidro border border-linha text-corpo text-fluid-xs">
                   <Check className="inline-block w-5 h-5 align-text-bottom mr-1" />  3 Suítes
                </span>
                <span className="px-3 py-1 rounded-xl bg-vidro border border-linha text-corpo text-fluid-xs">
                   <Check className="inline-block w-5 h-5 align-text-bottom mr-1" />  2 a 3 Vagas cobertas
                </span>
                <span className="px-3 py-1 rounded-xl bg-vidro border border-linha text-corpo text-fluid-xs">
                   <Check className="inline-block w-5 h-5 align-text-bottom mr-1" />  Varanda Gourmet
                </span>
              </div>
            </div>

            {/* Próximo Passo */}
            <div className="p-4 rounded-2xl border border-acento-linha bg-acento-lavado space-y-2">
              <h4 className="text-fluid-xs font-bold text-acento-suave">
                🎯 Próximo Passo Sugerido para o Corretor:
              </h4>
              <p className="text-fluid-xs text-corpo leading-relaxed">
                {lead.etapa === "visita_agendada"
                  ? "Confirmar presença na visita 2h antes e destacar a infraestrutura de lazer infantil e áreas verdes durante a apresentação."
                  : "Enviar o book digital com foco nas opções com varanda gourmet ampla e propor visita ao stand neste sábado."}
              </p>
            </div>
          </div>
        )}

        {/* ABA 2: LIVE CHAT WHATSAPP */}
        {aba === "chat" && (
          <div className="space-y-4 duration-200">
            <div className="bg-[#0b141a] rounded-2xl p-4 space-y-3 max-h-72 overflow-y-auto border border-linha">
              {/* Balão 1: Cliente */}
              <div className="flex justify-end">
                <div className="bg-[#005c4b] text-white p-3 rounded-2xl rounded-br-none max-w-[80%] text-fluid-xs space-y-1">
                  <p>{lead.mensagem || "Olá! Gostaria de saber mais sobre apartamentos de 3 suítes em Alphaville."}</p>
                  <span className="text-[9px] text-corpo block text-right">Hoje às 14:15</span>
                </div>
              </div>

              {/* Balão 2: IA */}
              <div className="flex justify-start">
                <div className="bg-[#202c33] text-titulo p-3 rounded-2xl rounded-bl-none max-w-[80%] text-fluid-xs space-y-2">
                  <p>
                    Olá, {lead.nome}! Excelente escolha. Temos opções exclusivas como o Canvas Alphaville e o Lumina Tamboré com 3 suítes e varanda gourmet. Você prefere imóvel na planta ou pronto para morar?
                  </p>
                  <span className="text-[9px] text-apoio block text-right">Hoje às 14:15</span>
                </div>
              </div>
            </div>

            {/* Ações Rápidas de Resposta */}
            <div className="flex items-center justify-between pt-2">
              <span className="text-[11px] text-apoio">
                Para responder você mesmo, use o WhatsApp Web ou celular.
              </span>

              {linkWhatsapp && (
                <a
                  href={linkWhatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2 rounded-xl bg-ok hover:opacity-85 text-white text-fluid-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>Abrir WhatsApp do Lead</span>
                  <span> <ArrowRight className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Rodapé */}
        <div className="flex justify-end pt-2 border-t border-linha">
          <button
            onClick={onFechar}
            className="px-5 py-2 rounded-xl bg-vidro-forte hover:bg-vidro-mais text-corpo text-fluid-xs font-bold transition-all cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

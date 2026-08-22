"use client";

import { useState, useTransition } from "react";
import type { Empreendimento } from "@/lib/types";
import { Shield, Building, Download, Rocket, Check, AlertTriangle, Zap, Radio } from "lucide-react";
import {
  criarCampanha,
  gerarPreviewCampanha,
  processarFilaAgora,
  statusDisparo,
  type CampanhaListada,
  type FiltroLeadsCampanha,
  type StatusDisparo,
} from "./acoes";

interface Props {
  empreendimentos: Empreendimento[];
  campanhasIniciais: CampanhaListada[];
  statusInicial: StatusDisparo | null;
}

const ROTULO_STATUS: Record<CampanhaListada["status"], string> = {
  rascunho: "Rascunho",
  em_andamento: "Enviando Fila",
  pausada: "Pausada",
  concluida: "Concluída",
};

export function CampanhasManager({ empreendimentos, campanhasIniciais, statusInicial }: Props) {
  const [titulo, setTitulo] = useState("");
  const [imovelSlug, setImovelSlug] = useState(empreendimentos[0]?.slug ?? "");
  const [filtroLeads, setFiltroLeads] = useState<FiltroLeadsCampanha>("parados_15d");
  const [mensagemBase, setMensagemBase] = useState(
    "Olá, {nome}! Tudo bem? Lembrei do seu interesse em Alphaville. Acabou de sair uma condição exclusiva na tabela do {imovel}. Gostaria de receber o book digital?",
  );
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [previewMensagens, setPreviewMensagens] = useState<string[]>([]);
  const [campanhas, setCampanhas] = useState<CampanhaListada[]>(campanhasIniciais);
  const [status, setStatus] = useState<StatusDisparo | null>(statusInicial);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, startCriacao] = useTransition();
  const [processando, startProcessamento] = useTransition();

  const imovelSelecionado = empreendimentos.find((e) => e.slug === imovelSlug) ?? null;

  const atualizarStatus = async () => setStatus(await statusDisparo());

  const gerarPreviewIA = () => {
    setErro(null);
    setGerandoPreview(true);
    startCriacao(async () => {
      const resultado = await gerarPreviewCampanha({
        filtro: filtroLeads,
        empreendimentoNome: imovelSelecionado?.nome ?? "nossos lançamentos em Alphaville",
        mensagemBase,
      });
      setGerandoPreview(false);

      if ("erro" in resultado) {
        setErro(resultado.erro);
        setPreviewMensagens([]);
        return;
      }
      setPreviewMensagens(resultado.mensagens);
    });
  };

  const iniciarDisparo = () => {
    if (!titulo.trim()) {
      setErro("Por favor, dê um título para a campanha.");
      return;
    }

    setErro(null);
    startCriacao(async () => {
      const resultado = await criarCampanha({
        titulo,
        empreendimentoId: imovelSelecionado?.id ?? null,
        empreendimentoNome: imovelSelecionado?.nome ?? "nossos lançamentos em Alphaville",
        filtro: filtroLeads,
        mensagemBase,
      });

      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }

      setCampanhas((prev) => [
        {
          id: resultado.campanhaId,
          titulo,
          empreendimentoNome: imovelSelecionado?.nome ?? null,
          totalLeads: resultado.totalLeads,
          totalEnviados: 0,
          totalRespondidos: 0,
          status: "em_andamento",
          criadoEm: new Date().toISOString(),
        },
        ...prev,
      ]);
      setTitulo("");
      setPreviewMensagens([]);
      await atualizarStatus();
      setFeedback(
        `Campanha criada para ${resultado.totalLeads} lead(s). O disparo já começou sozinho: as mensagens saem uma a cada 35-75s, em horário comercial, até a fila acabar. Não precisa clicar em mais nada.`,
      );
      setTimeout(() => setFeedback(null), 10000);
    });
  };

  const processarAgora = () => {
    setErro(null);
    startProcessamento(async () => {
      const resultado = await processarFilaAgora();
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }
      await atualizarStatus();

      const resumo =
        resultado.processados === 0
          ? "Nenhum envio vencido neste instante."
          : `Processados ${resultado.processados} envio(s): ${resultado.enviados} entregue(s), ${resultado.erros} com erro.`;

      const continuidade = resultado.continuaSozinha
        ? ` A fila segue andando sozinha — restam ${resultado.restantes} para enviar.`
        : resultado.restantes > 0
          ? ` Restam ${resultado.restantes} na fila. ${resultado.diagnostico.join(" ")}`
          : " Fila zerada.";

      setFeedback(resumo + continuidade);
      setTimeout(() => setFeedback(null), 10000);
    });
  };

  return (
    <div className="space-y-8">
      {/* Banner de Feedback */}
      {feedback && (
        <div className="rounded-2xl border border-ok-linha bg-ok-lavado p-4 text-fluid-xs font-semibold text-ok backdrop-blur duration-200">
          <Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> {feedback}
        </div>
      )}

      {erro && (
        <div className="rounded-2xl border border-alerta-linha bg-alerta-lavado p-4 text-fluid-xs font-semibold text-alerta backdrop-blur duration-200">
          <AlertTriangle className="inline-block w-5 h-5 align-text-bottom mr-1" /> {erro}
        </div>
      )}

      {/* Estado do motor de disparo — responde "por que não está saindo?" */}
      {status && (
        <div
          className={`rounded-2xl border p-4 sm:p-5 backdrop-blur ${
            status.impedimento
              ? "border-alerta-linha bg-alerta-lavado"
              : "border-ok-linha bg-ok-lavado"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-2">
              <Radio
                className={`w-5 h-5 shrink-0 mt-0.5 ${status.impedimento ? "text-alerta" : "text-ok animate-pulse"}`}
              />
              <div>
                <h4 className={`text-fluid-xs font-bold ${status.impedimento ? "text-alerta" : "text-ok"}`}>
                  {status.impedimento
                    ? "Disparo automático parado"
                    : status.pendentes > 0
                      ? "Disparo automático em andamento"
                      : "Disparo automático pronto"}
                </h4>
                <p className="text-[11px] text-apoio mt-0.5">
                  {status.impedimento ??
                    (status.pendentes > 0
                      ? "As mensagens saem sozinhas, uma a cada 35-75s, sem ninguém precisar clicar."
                      : "Nenhuma mensagem na fila. Crie uma campanha abaixo.")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5 text-fluid-xs text-corpo">
              <div>
                <span className="text-tenue block text-[10px]">Na fila</span>
                <span className="font-bold text-titulo">{status.pendentes}</span>
              </div>
              <div>
                <span className="text-tenue block text-[10px]">Cota de hoje</span>
                <span className="font-bold text-titulo">
                  {status.saldoHoje === null ? "—" : status.saldoHoje}
                </span>
              </div>
              {status.proximoAgendadoEm && (
                <div>
                  <span className="text-tenue block text-[10px]">Próximo envio</span>
                  <span className="font-bold text-titulo">
                    {new Date(status.proximoAgendadoEm).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
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
              value={imovelSlug}
              onChange={(e) => setImovelSlug(e.target.value)}
              className="w-full rounded-xl border border-linha-forte bg-campo px-4 py-2.5 text-fluid-sm text-titulo focus:border-acento focus:outline-none cursor-pointer"
            >
              {empreendimentos.map((emp) => (
                <option key={emp.slug} value={emp.slug}>
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
              <h4 className="text-fluid-xs font-bold">
                {" "}
                <Download className="inline-block w-5 h-5 align-text-bottom mr-1" /> Novos Leads
              </h4>
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
            <span className="text-ok">
              {" "}
              <Shield className="inline-block w-5 h-5 align-text-bottom mr-1" /> Proteção Anti-Ban:
            </span>
            <span>Envio com delay dinâmico de 30 a 75 segundos, só em horário comercial.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={gerarPreviewIA}
              disabled={gerandoPreview || criando}
              className="px-4 py-2 rounded-xl bg-vidro-forte hover:bg-vidro-mais text-titulo text-fluid-xs font-semibold transition-colors border border-linha-forte cursor-pointer disabled:opacity-60"
            >
              {gerandoPreview ? "Gerando Variações..." : "👁️ Ver Variações da IA"}
            </button>
            <button
              onClick={iniciarDisparo}
              disabled={criando}
              className="px-6 py-2 rounded-xl bg-acento hover:bg-acento-hover text-white text-fluid-xs font-bold transition-all shadow-md shadow-acento/20 cursor-pointer disabled:opacity-60"
            >
              <Rocket className="inline-block w-5 h-5 align-text-bottom mr-1" />
              {criando ? "Criando..." : "Iniciar Campanha Segura"}
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-fluid-base font-bold text-titulo">Histórico de Campanhas</h3>
            <p className="text-fluid-xs text-apoio">
              Acompanhe o andamento da fila de envios e a taxa de resposta dos clientes. A fila anda
              sozinha — o botão ao lado só serve para não esperar o próximo ciclo.
            </p>
          </div>
          <button
            onClick={processarAgora}
            disabled={processando}
            className="px-4 py-2 rounded-xl bg-vidro-forte hover:bg-vidro-mais text-titulo text-fluid-xs font-semibold transition-colors border border-linha-forte cursor-pointer disabled:opacity-60 shrink-0"
          >
            <Zap className="inline-block w-4 h-4 align-text-bottom mr-1" />
            {processando ? "Processando..." : "Empurrar fila agora"}
          </button>
        </div>

        {campanhas.length === 0 && (
          <p className="text-fluid-xs text-tenue py-6 text-center">
            Nenhuma campanha ainda. Crie a primeira acima.
          </p>
        )}

        <div className="divide-y divide-linha">
          {campanhas.map((c) => {
            const perc = c.totalLeads > 0 ? Math.round((c.totalEnviados / c.totalLeads) * 100) : 0;
            return (
              <div key={c.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-fluid-sm font-bold text-titulo">{c.titulo}</h4>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                        c.status === "concluida"
                          ? "bg-ok-lavado border-ok-linha text-ok"
                          : c.status === "em_andamento"
                          ? "bg-alerta-lavado border-alerta-linha text-alerta animate-pulse"
                          : "bg-vidro border-linha text-apoio"
                      }`}
                    >
                      {ROTULO_STATUS[c.status]}
                    </span>
                  </div>
                  <p className="text-fluid-xs text-apoio">
                    <Building className="inline-block w-5 h-5 align-text-bottom mr-1" />{" "}
                    {c.empreendimentoNome ?? "Sem empreendimento vinculado"} •{" "}
                    {new Date(c.criadoEm).toLocaleString("pt-BR")}
                  </p>
                </div>

                <div className="flex items-center gap-6 text-fluid-xs text-corpo">
                  <div>
                    <span className="text-tenue block text-[10px]">Progresso</span>
                    <span className="font-bold text-titulo">
                      {c.totalEnviados}/{c.totalLeads} ({perc}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-tenue block text-[10px]">Respostas</span>
                    <span className="font-bold text-ok">
                      {c.totalRespondidos} leads (
                      {Math.round((c.totalRespondidos / (c.totalEnviados || 1)) * 100)}%)
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

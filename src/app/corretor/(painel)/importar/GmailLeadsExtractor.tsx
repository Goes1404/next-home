"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { PortalOrigem } from "@/lib/inbound/types";
import { Tag, Building, Home, Smartphone, Globe, Mail, FileText, ClipboardList, Download, AlertTriangle, MessageCircle, Rocket, RefreshCw, Sparkles, Zap, Check } from 'lucide-react';
import {
  analisarEmailGmail,
  salvarLeadsDoGmail,
  buscarHistoricoInbound,
  type LeadEmailRevisado,
  type InboundLogItem,
  type ResumoImportacao,
} from "./actions";

type Empreendimento = { id: string; nome: string };

/*
 * Portal de origem: ícone, rótulo e um ponto na cor de MARCA do portal.
 *
 * Antes o selo inteiro era pintado com Tailwind cru (`bg-blue-500/15`,
 * `text-blue-400`…), o que tinha dois problemas. O primeiro é que cor crua
 * não acompanha o tema: `-400` sobre `/15` só funciona no escuro, e no claro
 * o selo virava texto pastel sobre branco. O segundo é mais de fundo — eram
 * SETE cores competindo com a cor de módulo e com a rampa de etapa na mesma
 * tela, uma terceira linguagem de cor que ninguém pediu.
 *
 * A cor de marca continua ali, porque é ela que faz reconhecer o portal de
 * relance, mas num ponto de 6px: identifica sem tingir. É o mesmo desenho do
 * `BadgePortal` em `_componentes/CartaoLead.tsx`, que já fazia certo — havia
 * duas implementações do mesmo selo, e agora as duas falam a mesma língua.
 */
const PORTAL_INFO: Record<
  PortalOrigem,
  { label: string; cor: string; icone: React.ReactNode }
> = {
  zap_imoveis: { label: "Zap Imóveis", cor: "#0f5bd7", icone: <Zap className="h-4 w-4" /> },
  vivareal: { label: "VivaReal", cor: "#e84c3d", icone: <Home className="h-4 w-4" /> },
  olx: { label: "OLX", cor: "#6e0ad6", icone: <Tag className="h-4 w-4" /> },
  imovelweb: { label: "Imovelweb", cor: "#e67e22", icone: <Building className="h-4 w-4" /> },
  meta_ads: {
    label: "Meta Ads (Insta/FB)",
    cor: "#0066ff",
    icone: <Smartphone className="h-4 w-4" />,
  },
  site_direto: { label: "Formulário do Site", cor: "#00806c", icone: <Globe className="h-4 w-4" /> },
  email_outro: { label: "E-mail Direto", cor: "#6d827c", icone: <Mail className="h-4 w-4" /> },
};

const EXEMPLOS_EMAIL = [
  {
    titulo: "Zap Imóveis",
    portal: "zap_imoveis" as const,
    texto: `De: leads@zapimoveis.com.br
Assunto: Novo lead interessado no imóvel Canvas Alphaville

Você recebeu um novo contato pelo Zap Imóveis:

Nome: Roberto Albuquerque de Mello
Telefone: (11) 98452-9910
E-mail: roberto.albuquerque@gmail.com
Imóvel: Canvas Alphaville - Apartamento 180m² (Ref: CNV-180)
Mensagem: Olá, tenho interesse em conhecer a planta de 180m² com 3 suítes. Gostaria de saber os valores e agendar uma visita no decorado para o próximo sábado à tarde.`,
  },
  {
    titulo: "VivaReal",
    portal: "vivareal" as const,
    texto: `De: atendimento@vivareal.com.br
Assunto: Lead Interessado - Origem Alphaville

Parabéns! Um cliente enviou uma mensagem pelo VivaReal:

Cliente: Juliana Castro Mendes
WhatsApp: (11) 99871-2234
E-mail: juliana.castro.arq@uol.com.br
Interesse: Origem Alphaville - Casa 4 suítes
Dúvida do cliente: Olá! Tenho um imóvel em Santana de Parnaíba para dar de permuta. Vocês aceitam? Por favor me chamem no WhatsApp.`,
  },
  {
    titulo: "OLX Imóveis",
    portal: "olx" as const,
    texto: `De: contato@olx.com.br
Assunto: Novo contato para o anúncio: Casa em Alphaville Residencial 1

Nome do interessado: Marcelo Viana Pinto
Celular: 11976543210
Email: marcelo.viana@techcorp.io
Mensagem enviada: Boa tarde! Vi seu anúncio na OLX. O imóvel ainda está disponível? Qual a condição de pagamento à vista com financiamento bancário?`,
  },
  {
    titulo: "Imovelweb",
    portal: "imovelweb" as const,
    texto: `De: leads@imovelweb.com.br
Assunto: Proposta / Contato recebido - Imovelweb

Dados do lead:
Nome: Dra. Beatriz Siqueira
Telefone: (11) 99112-3344
E-mail: beatriz.siqueira@med.usp.br
Imóvel de Referência: Alphasítio Residencial
Mensagem: Gostaria de receber o book digital completo e a tabela de valores atualizada deste lançamento. Aguardo contato.`,
  },
];

export function GmailLeadsExtractor({
  empreendimentos,
  ehGestor,
}: {
  empreendimentos: Empreendimento[];
  ehGestor: boolean;
}) {
  const [secao, setSecao] = useState<"extrator" | "automacao" | "historico">("extrator");
  const [textoEmail, setTextoEmail] = useState("");
  const [assuntoEmail, setAssuntoEmail] = useState("");
  const [remetenteEmail, setRemetenteEmail] = useState("");
  const [leadsExtraidos, setLeadsExtraidos] = useState<(LeadEmailRevisado & { incluir: boolean })[]>(
    [],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [resumo, setResumo] = useState<ResumoImportacao | null>(null);

  const [distribuir, setDistribuir] = useState(false);
  const [consentimento, setConsentimento] = useState(true);

  const [analisando, iniciarAnalise] = useTransition();
  const [salvando, iniciarSalvamento] = useTransition();
  const [carregandoHistorico, iniciarCarregamentoHistorico] = useTransition();
  const [logsHistorico, setLogsHistorico] = useState<InboundLogItem[]>([]);

  const [copiadoWebhook, setCopiadoWebhook] = useState(false);
  const [copiadoFiltro, setCopiadoFiltro] = useState(false);

  function carregarExemplo(ex: (typeof EXEMPLOS_EMAIL)[0]) {
    setTextoEmail(ex.texto);
    setAssuntoEmail(`Novo lead via ${ex.titulo}`);
    setRemetenteEmail(`notificacoes@${ex.portal}.com.br`);
    setErro(null);
    setSucesso(null);
    setResumo(null);
  }

  function handleAnalisar() {
    if (!textoEmail.trim()) {
      setErro("Cole o conteúdo do e-mail antes de analisar.");
      return;
    }
    setErro(null);
    setSucesso(null);
    setResumo(null);

    iniciarAnalise(async () => {
      const res = await analisarEmailGmail({
        texto: textoEmail,
        assunto: assuntoEmail || undefined,
        remetente: remetenteEmail || undefined,
      });

      if (res.erro || !res.leads) {
        setErro(res.erro ?? "Nenhum lead com telefone foi identificado neste e-mail.");
        return;
      }

      setLeadsExtraidos(res.leads.map((l) => ({ ...l, incluir: !l.jaExiste })));
    });
  }

  function handleSalvar() {
    const selecionados = leadsExtraidos.filter((l) => l.incluir);
    if (selecionados.length === 0) {
      setErro("Selecione ao menos um lead para importar.");
      return;
    }
    if (!consentimento) {
      setErro("Confirme o consentimento LGPD antes de importar.");
      return;
    }

    setErro(null);
    iniciarSalvamento(async () => {
      const res = await salvarLeadsDoGmail(selecionados, {
        distribuirNaEquipe: distribuir,
        consentimento,
      });

      if (res.erro) {
        setErro(res.erro);
        return;
      }

      setResumo(res);
      setSucesso(
        `${res.inseridos} lead(s) adicionado(s) com sucesso ao Funil de Vendas na etapa "Novo Lead"!`,
      );
      setLeadsExtraidos([]);
      setTextoEmail("");
    });
  }

  function abrirHistorico() {
    setSecao("historico");
    iniciarCarregamentoHistorico(async () => {
      const logs = await buscarHistoricoInbound();
      setLogsHistorico(logs);
    });
  }

  function alterarLead(
    idx: number,
    campo: keyof LeadEmailRevisado | "incluir",
    valor: any,
  ) {
    setLeadsExtraidos((atuais) =>
      atuais.map((lead, i) => (i === idx ? { ...lead, [campo]: valor } : lead)),
    );
  }

  const selecionadosCount = leadsExtraidos.filter((l) => l.incluir).length;

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/email-lead`
      : "https://nexthome.com.br/api/webhooks/email-lead";

  return (
    <div className="space-y-6">
      {/* Barra de Sub-Navegação Visual */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-linha bg-superficie p-3 shadow-painel">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSecao("extrator")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              secao === "extrator"
                ? "bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm"
                : "text-apoio hover:bg-vidro hover:text-titulo",
            )}
          >
            <span> <Sparkles className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Extrator de E-mails / Gmail
          </button>
          <button
            type="button"
            onClick={() => setSecao("automacao")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              secao === "automacao"
                ? "bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm"
                : "text-apoio hover:bg-vidro hover:text-titulo",
            )}
          >
            <span> <Zap className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Automação & Webhook
          </button>
          <button
            type="button"
            onClick={abrirHistorico}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              secao === "historico"
                ? "bg-brand-500/20 text-brand-300 border border-brand-500/40 shadow-sm"
                : "text-apoio hover:bg-vidro hover:text-titulo",
            )}
          >
            <span> <FileText className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Histórico de E-mails
          </button>
        </div>

        <div className="hidden items-center gap-2 text-fluid-xs text-apoio sm:flex">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-400 animate-pulse" />
          IA Parser + Detecção de Portais Ativa
        </div>
      </div>

      {/* SEÇÃO 1: EXTRATOR VISUAL */}
      {secao === "extrator" && (
        <div className="space-y-6">
          {/* Card de Entrada */}
          <div className="rounded-2xl border border-linha bg-superficie p-6 shadow-painel">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-display text-titulo text-lg font-semibold flex items-center gap-2">
                  <span className="text-xl"> <Download className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Puxar Leads do Gmail & Portais
                </h2>
                <p className="text-fluid-xs text-apoio mt-1">
                  Copie o conteúdo de qualquer e-mail recebido no seu Gmail (Zap, VivaReal, OLX,
                  Imovelweb ou cliente direto) e cole abaixo. A IA identifica os dados em segundos.
                </p>
              </div>

              {/* Botões de Exemplos Rápidos */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-fluid-xs text-tenue mr-1">Testar modelo:</span>
                {EXEMPLOS_EMAIL.map((ex) => (
                  <button
                    key={ex.titulo}
                    type="button"
                    onClick={() => carregarExemplo(ex)}
                    className="rounded-lg border border-linha bg-vidro px-2.5 py-1 text-xs font-medium text-apoio transition-colors hover:border-brand-400/50 hover:bg-brand-500/10 hover:text-brand-300"
                  >
                    {ex.titulo}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-fluid-xs text-apoio mb-1 block">
                    Assunto do E-mail (Opcional)
                  </label>
                  <input
                    type="text"
                    value={assuntoEmail}
                    onChange={(e) => setAssuntoEmail(e.target.value)}
                    placeholder="Ex: Novo lead interessado no Canvas..."
                    className="w-full rounded-xl border border-linha-forte bg-campo px-3.5 py-2 text-sm text-titulo outline-none focus:border-brand-400"
                  />
                </div>
                <div>
                  <label className="text-fluid-xs text-apoio mb-1 block">
                    Remetente / De (Opcional)
                  </label>
                  <input
                    type="text"
                    value={remetenteEmail}
                    onChange={(e) => setRemetenteEmail(e.target.value)}
                    placeholder="Ex: leads@zapimoveis.com.br"
                    className="w-full rounded-xl border border-linha-forte bg-campo px-3.5 py-2 text-sm text-titulo outline-none focus:border-brand-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-fluid-xs text-apoio mb-1 block">
                  Corpo do E-mail ou Texto Copiado do Gmail
                </label>
                <textarea
                  rows={8}
                  value={textoEmail}
                  onChange={(e) => setTextoEmail(e.target.value)}
                  placeholder="Cole aqui o texto completo ou HTML do e-mail recebido..."
                  className="w-full font-mono text-xs leading-relaxed rounded-xl border border-linha-forte bg-campo p-4 text-titulo outline-none focus:border-brand-400 transition-colors"
                />
              </div>

              {erro && (
                <div className="rounded-xl border border-perigo/30 bg-perigo/10 p-3.5 text-sm text-perigo flex items-center gap-2">
                  <span> <AlertTriangle className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> {erro}
                </div>
              )}

              {sucesso && (
                <div className="rounded-xl border border-ok/30 bg-ok/10 p-3.5 text-sm text-ok flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span> <Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> {sucesso}
                  </div>
                  <Link
                    href="/corretor/funil"
                    className="rounded-lg bg-ok px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                  >
                    Ver no Funil →
                  </Link>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleAnalisar}
                  disabled={analisando || !textoEmail.trim()}
                  className="flex items-center gap-2 rounded-full bg-brand-500 hover:bg-brand-400 disabled:opacity-50 px-7 py-3 text-sm font-semibold text-white shadow-lg transition-all cursor-pointer"
                >
                  {analisando ? (
                    <>
                      <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Analisando com Inteligência Artificial…
                    </>
                  ) : (
                    <>
                      <span> <Sparkles className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Analisar & Extrair Leads do E-mail
                    </>
                  )}
                </button>

                {textoEmail.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      setTextoEmail("");
                      setAssuntoEmail("");
                      setRemetenteEmail("");
                      setLeadsExtraidos([]);
                      setErro(null);
                      setSucesso(null);
                    }}
                    className="text-fluid-xs text-tenue hover:text-apoio underline"
                  >
                    Limpar campos
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Dossiê dos Leads Extraídos */}
          {leadsExtraidos.length > 0 && (
            <div className="space-y-4 rounded-2xl border border-brand-500/30 bg-superficie p-6 shadow-painel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-linha pb-4">
                <div>
                  <h3 className="font-display text-titulo text-lg font-semibold flex items-center gap-2">
                    <span> <ClipboardList className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> {leadsExtraidos.length} Lead(s) Identificado(s)
                  </h3>
                  <p className="text-fluid-xs text-apoio mt-0.5">
                    Revise as informações extraídas antes de enviar para o seu funil de vendas.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-fluid-xs text-apoio">
                    {selecionadosCount} selecionado(s)
                  </span>
                </div>
              </div>

              {/* Cards dos Leads */}
              <div className="grid gap-4">
                {leadsExtraidos.map((lead, idx) => {
                  const portal = PORTAL_INFO[lead.portalOrigem] || PORTAL_INFO.email_outro;
                  return (
                    <div
                      key={lead.idTemp}
                      className={cn(
                        "rounded-xl border p-4.5 transition-all",
                        lead.incluir
                          ? "border-brand-500/30 bg-vidro"
                          : "border-linha bg-superficie/40 opacity-60",
                      )}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={lead.incluir}
                            onChange={(e) => alterarLead(idx, "incluir", e.target.checked)}
                            className="accent-brand-400 h-5 w-5 rounded cursor-pointer"
                          />
                          <span className="border-linha bg-vidro text-corpo inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 shrink-0 rounded-full"
                              style={{ background: portal.cor }}
                            />
                            <span aria-hidden>{portal.icone}</span> {portal.label}
                          </span>
                          {lead.jaExiste && (
                            <span className="border-alerta-linha bg-alerta-lavado text-alerta rounded-full border px-2 py-0.5 text-[11px] font-medium">
                               <AlertTriangle className="inline-block w-5 h-5 align-text-bottom mr-1" />  Já cadastrado
                            </span>
                          )}
                        </div>

                        {lead.telefone && (
                          <a
                            href={`https://wa.me/${lead.telefone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-fluid-xs font-medium text-[#25D366] hover:underline"
                          >
                            <span> <MessageCircle className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Abrir WhatsApp
                          </a>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="text-[11px] text-tenue uppercase tracking-wider block mb-1">
                            Nome
                          </label>
                          <input
                            type="text"
                            value={lead.nome}
                            onChange={(e) => alterarLead(idx, "nome", e.target.value)}
                            className="w-full rounded-lg border border-linha-forte bg-campo px-3 py-1.5 text-sm text-titulo outline-none focus:border-brand-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-tenue uppercase tracking-wider block mb-1">
                            Telefone / WhatsApp
                          </label>
                          <input
                            type="text"
                            value={lead.telefone}
                            onChange={(e) => alterarLead(idx, "telefone", e.target.value)}
                            className="w-full rounded-lg border border-linha-forte bg-campo px-3 py-1.5 text-sm text-titulo outline-none focus:border-brand-400"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-tenue uppercase tracking-wider block mb-1">
                            E-mail
                          </label>
                          <input
                            type="email"
                            value={lead.email || ""}
                            onChange={(e) => alterarLead(idx, "email", e.target.value)}
                            placeholder="Opcional"
                            className="w-full rounded-lg border border-linha-forte bg-campo px-3 py-1.5 text-sm text-titulo outline-none focus:border-brand-400"
                          />
                        </div>
                      </div>

                      {/* Imóvel de Interesse & Match */}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-[11px] text-tenue uppercase tracking-wider block mb-1">
                            Imóvel de Interesse do Catálogo
                          </label>
                          <select
                            value={lead.empreendimentoSugeridoId || ""}
                            onChange={(e) =>
                              alterarLead(idx, "empreendimentoSugeridoId", e.target.value || null)
                            }
                            className="w-full rounded-lg border border-linha-forte bg-campo px-3 py-1.5 text-sm text-titulo outline-none focus:border-brand-400 cursor-pointer"
                          >
                            <option value="">Nenhum / Selecionar manualmente</option>
                            {empreendimentos.map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.nome}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] text-tenue uppercase tracking-wider block mb-1">
                            Referência / Anúncio Citado
                          </label>
                          <input
                            type="text"
                            value={lead.imovelInteresse || lead.codigoReferencia || ""}
                            onChange={(e) => alterarLead(idx, "imovelInteresse", e.target.value)}
                            placeholder="Ex: Ref CNV-180"
                            className="w-full rounded-lg border border-linha-forte bg-campo px-3 py-1.5 text-sm text-titulo outline-none focus:border-brand-400"
                          />
                        </div>
                      </div>

                      {/* Mensagem Extraída */}
                      {lead.mensagemOriginal && (
                        <div className="mt-3 rounded-lg border border-linha bg-campo/60 p-3">
                          <span className="text-[11px] text-tenue uppercase tracking-wider block mb-1">
                            Mensagem / Dúvida do Lead:
                          </span>
                          <p className="text-fluid-xs text-corpo whitespace-pre-wrap">
                            {lead.mensagemOriginal}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Ações de Envio */}
              <div className="space-y-4 pt-4 border-t border-linha">
                {ehGestor && (
                  <label className="flex items-center gap-2.5 text-fluid-sm text-corpo cursor-pointer">
                    <input
                      type="checkbox"
                      checked={distribuir}
                      onChange={(e) => setDistribuir(e.target.checked)}
                      className="accent-brand-400 h-4.5 w-4.5 rounded cursor-pointer"
                    />
                    <span>Distribuir entre a equipe pela roleta de corretores</span>
                  </label>
                )}

                <label className="flex items-start gap-2.5 text-fluid-xs text-apoio cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentimento}
                    onChange={(e) => setConsentimento(e.target.checked)}
                    className="accent-brand-400 mt-0.5 h-4.5 w-4.5 rounded cursor-pointer shrink-0"
                  />
                  <span>
                    Confirmo que estes dados foram originados de consentimento/contato com o titular
                    conforme as diretrizes da LGPD.
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSalvar}
                    disabled={salvando || selecionadosCount === 0 || !consentimento}
                    className="flex items-center gap-2 rounded-full bg-brand-500 hover:bg-brand-400 disabled:opacity-50 px-7 py-3 text-sm font-semibold text-white shadow-lg transition-all cursor-pointer"
                  >
                    {salvando ? (
                      <>
                        <span className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                        Importando para o Funil…
                      </>
                    ) : (
                      <>
                        <span> <Rocket className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Enviar {selecionadosCount} Lead(s) para o Funil de Vendas
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setLeadsExtraidos([])}
                    className="rounded-full border border-linha px-4 py-2.5 text-xs text-apoio hover:text-titulo"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SEÇÃO 2: GUIA DE AUTOMAÇÃO E WEBHOOK */}
      {secao === "automacao" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-linha bg-superficie p-6 shadow-painel space-y-6">
            <div>
              <h2 className="font-display text-titulo text-lg font-semibold flex items-center gap-2">
                <span> <Zap className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Sincronização Automática com Gmail & Portais
              </h2>
              <p className="text-fluid-xs text-apoio mt-1">
                Configure uma regra de encaminhamento automático no seu Gmail para que todo lead do
                Zap, VivaReal, OLX ou formulários caia no funil de vendas em tempo real.
              </p>
            </div>

            {/* Endereço do Webhook */}
            <div className="rounded-xl border border-brand-500/30 bg-brand-900/20 p-5 space-y-2">
              <span className="text-[11px] font-bold text-brand-300 uppercase tracking-wider">
                Endereço de Webhook de Ingestão
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 font-mono text-xs text-mist-100 select-all">
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookUrl);
                    setCopiadoWebhook(true);
                    setTimeout(() => setCopiadoWebhook(false), 2000);
                  }}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-400 transition-colors"
                >
                  {copiadoWebhook ? <><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Copiado!</> : "Copiar URL"}
                </button>
              </div>
              <p className="text-[11px] text-mist-400">
                Qualquer serviço de e-mail (SendGrid Inbound, CloudMailin, Zapier ou Webhook Gmail)
                pode enviar dados para este endpoint.
              </p>
            </div>

            {/* Passo a Passo Ilustrado */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-linha bg-campo p-4.5 space-y-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 font-bold text-sm">
                  1
                </div>
                <h4 className="font-semibold text-sm text-titulo">Crie o Filtro no Gmail</h4>
                <p className="text-fluid-xs text-apoio">
                  No Gmail, pesquise por e-mails de portais e clique em &quot;Criar filtro&quot;.
                </p>
                <div className="pt-2">
                  <span className="text-[10px] text-tenue block mb-1">Filtro recomendado:</span>
                  <div className="flex items-center gap-1.5">
                    <code className="text-[10px] rounded bg-black/30 p-1 font-mono text-mist-200 truncate flex-1">
                      from:(zapimoveis OR vivareal OR olx OR imovelweb)
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          "from:(zapimoveis OR vivareal OR olx OR imovelweb)",
                        );
                        setCopiadoFiltro(true);
                        setTimeout(() => setCopiadoFiltro(false), 2000);
                      }}
                      className="text-[10px] text-brand-300 hover:underline"
                    >
                      {copiadoFiltro ? <Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> : "Copiar"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-linha bg-campo p-4.5 space-y-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 font-bold text-sm">
                  2
                </div>
                <h4 className="font-semibold text-sm text-titulo">Defina o Encaminhamento</h4>
                <p className="text-fluid-xs text-apoio">
                  Marque a opção &quot;Encaminhar para&quot; e adicione o e-mail do seu provedor de
                  webhook ou serviço de integração.
                </p>
              </div>

              <div className="rounded-xl border border-linha bg-campo p-4.5 space-y-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20 text-brand-300 font-bold text-sm">
                  3
                </div>
                <h4 className="font-semibold text-sm text-titulo">Leads no CRM em 2s</h4>
                <p className="text-fluid-xs text-apoio">
                  Assim que o portal notificar novo cliente, a IA da NextHome processa, qualifica e
                  coloca no funil de vendas.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SEÇÃO 3: HISTÓRICO DE AUDITORIA */}
      {secao === "historico" && (
        <div className="rounded-2xl border border-linha bg-superficie p-6 shadow-painel space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-titulo text-lg font-semibold flex items-center gap-2">
                <span> <FileText className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> Histórico de E-mails Recebidos
              </h2>
              <p className="text-fluid-xs text-apoio mt-0.5">
                Auditoria de todas as mensagens e leads processados pelo sistema.
              </p>
            </div>

            <button
              type="button"
              onClick={abrirHistorico}
              disabled={carregandoHistorico}
              className="rounded-lg border border-linha px-3 py-1.5 text-xs text-apoio hover:text-titulo flex items-center gap-1.5"
            >
              <span> <RefreshCw className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span> {carregandoHistorico ? "Atualizando…" : "Atualizar"}
            </button>
          </div>

          {logsHistorico.length === 0 ? (
            <div className="rounded-xl border border-linha bg-campo p-8 text-center">
              <p className="text-sm text-apoio">Nenhum registro de e-mail recente no momento.</p>
              <p className="text-fluid-xs text-tenue mt-1">
                Os e-mails recebidos pelo webhook ou extraídos aparecerão listados aqui.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-linha">
              <table className="w-full text-left text-xs text-corpo">
                <thead className="border-b border-linha bg-campo text-[11px] uppercase tracking-wider text-tenue">
                  <tr>
                    <th className="px-4 py-3">Data/Hora</th>
                    <th className="px-4 py-3">De / Remetente</th>
                    <th className="px-4 py-3">Assunto</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linha">
                  {logsHistorico.map((log) => (
                    <tr key={log.id} className="hover:bg-vidro transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-tenue">
                        {new Date(log.criadoEm).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 font-medium text-titulo">
                        {log.de || "Não informado"}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate text-corpo">
                        {log.assunto || "Sem assunto"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            log.status === "sucesso" && "bg-ok/15 text-ok",
                            log.status === "ignorado" && "bg-alerta-lavado text-alerta",
                            log.status === "erro" && "bg-perigo/15 text-perigo",
                          )}
                        >
                          {log.status === "sucesso"
                            ? <><Check className="inline-block w-5 h-5 align-text-bottom mr-1" /> Sucesso</>
                            : log.status === "ignorado"
                              ? "Ignorado"
                              : "Erro"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

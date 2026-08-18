"use client";

import { useState } from "react";
import type { ModoBotWhatsapp, StatusConexaoWhatsapp, TomVozBot } from "@/lib/whatsapp/types";
import { conectarWhatsapp, salvarConfiguracaoWhatsapp, testarAgenteIA } from "./acoes";

interface Props {
  corretorNome: string;
  /** Configuração já gravada, quando a instância existe. */
  configInicial?: {
    nomeAssistente: string;
    tomVoz: TomVozBot;
    modoBot: ModoBotWhatsapp;
    statusConexao: StatusConexaoWhatsapp;
    telefoneConectado: string | null;
  } | null;
}

interface MensagemPlayground {
  remetente: "cliente" | "bot";
  texto: string;
  hora: string;
  anexos?: { tipo: string; url: string; titulo: string }[];
}

export function WhatsappManager({ corretorNome, configInicial }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<"configuracoes" | "playground">("configuracoes");
  // O status vem do que está gravado na instância, não da existência de um
  // telefone no cadastro — ter WhatsApp no perfil não significa ter um
  // número pareado com o provedor.
  const [statusConexao, setStatusConexao] = useState<StatusConexaoWhatsapp>(
    configInicial?.statusConexao ?? "desconectado",
  );
  const [telefoneConectado, setTelefoneConectado] = useState<string | null>(
    configInicial?.telefoneConectado ?? null,
  );
  const [modoBot, setModoBot] = useState<ModoBotWhatsapp>(configInicial?.modoBot ?? "24_7");
  const [nomeAssistente, setNomeAssistente] = useState(configInicial?.nomeAssistente ?? "Sofia");
  const [tomVoz, setTomVoz] = useState<TomVozBot>(
    configInicial?.tomVoz ?? "consultivo_alto_padrao",
  );
  const [mostrarQrCode, setMostrarQrCode] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [erroConexao, setErroConexao] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);

  // Estados do Playground de Teste da IA
  const [mensagensChat, setMensagensChat] = useState<MensagemPlayground[]>([
    {
      remetente: "bot",
      texto: `Olá! Sou a ${nomeAssistente}, assistente pessoal do consultor ${corretorNome} da Next Home em Alphaville. Como posso te ajudar hoje?`,
      hora: "Agora",
    },
  ]);
  const [inputChat, setInputChat] = useState("");
  const [iaDigitando, setIaDigitando] = useState(false);
  // Começa vazio: preencher com um dossiê fictício faria o corretor validar
  // uma leitura que a IA nunca fez.
  const [dossiePlayground, setDossiePlayground] = useState<{
    resumo: string | null;
    temperatura: number | null;
  }>({ resumo: null, temperatura: null });

  const gerarQrCode = async () => {
    setConectando(true);
    setErroConexao(null);
    setMostrarQrCode(true);

    const resultado = await conectarWhatsapp();
    setConectando(false);

    if (resultado.erro) {
      setErroConexao(resultado.erro);
      setQrCodeBase64(null);
      setStatusConexao("desconectado");
      return;
    }

    setQrCodeBase64(resultado.qrcodeBase64 ?? null);
    setStatusConexao(resultado.jaConectado ? "conectado" : "conectando");
  };

  const desconectar = () => {
    setStatusConexao("desconectado");
    setTelefoneConectado(null);
    setMostrarQrCode(false);
    setQrCodeBase64(null);
    setFeedback("Instância desconectada.");
    setTimeout(() => setFeedback(null), 4000);
  };

  const salvarConfiguracoes = async () => {
    setSalvando(true);
    const resultado = await salvarConfiguracaoWhatsapp({ nomeAssistente, tomVoz, modoBot });
    setSalvando(false);
    setFeedback(resultado.erro ?? resultado.ok ?? null);
    setTimeout(() => setFeedback(null), 4000);
  };

  /**
   * Chama o MESMO agente que atende o cliente no WhatsApp (Gemini + catálogo
   * real), não uma simulação — é isso que torna o playground um teste de
   * verdade do tom de voz e das recomendações antes de pôr o número no ar.
   */
  const enviarMensagemPlayground = async (textoOpcao?: string) => {
    const texto = textoOpcao || inputChat;
    if (!texto.trim() || iaDigitando) return;

    const historico = mensagensChat.map((m) => ({
      remetente: m.remetente,
      texto: m.texto,
    }));

    setMensagensChat((prev) => [...prev, { remetente: "cliente", texto, hora: "Agora" }]);
    setInputChat("");
    setIaDigitando(true);
    setAvisoIa(null);

    const resposta = await testarAgenteIA(texto, historico);
    setIaDigitando(false);

    if ("erro" in resposta) {
      setAvisoIa(resposta.erro);
      return;
    }

    if (!resposta.iaAtiva) {
      setAvisoIa(
        "A IA respondeu pelo modo de contingência (sem GEMINI_API_KEY configurada) — este texto não reflete o agente real.",
      );
    }

    setMensagensChat((prev) => [
      ...prev,
      {
        remetente: "bot",
        texto: resposta.texto,
        hora: "Agora",
        anexos: resposta.anexos.length > 0 ? resposta.anexos : undefined,
      },
    ]);

    setDossiePlayground({ resumo: resposta.resumoDossie, temperatura: resposta.score });
  };

  return (
    <div className="space-y-8">
      {/* Navegação entre Abas */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-4">
        <button
          onClick={() => setAbaAtiva("configuracoes")}
          className={`px-4 py-2 rounded-xl text-fluid-xs font-bold transition-all cursor-pointer ${
            abaAtiva === "configuracoes"
              ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
              : "bg-white/5 text-mist-400 hover:text-white hover:bg-white/10"
          }`}
        >
          📱 Conexão & Configurações
        </button>

        <button
          onClick={() => setAbaAtiva("playground")}
          className={`px-4 py-2 rounded-xl text-fluid-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            abaAtiva === "playground"
              ? "bg-brand-500 text-white shadow-md shadow-brand-500/20"
              : "bg-white/5 text-mist-400 hover:text-white hover:bg-white/10"
          }`}
        >
          <span>🧪 Testar Minha IA ao Vivo</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            Playground
          </span>
        </button>
      </div>

      {feedback && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-fluid-xs font-semibold text-emerald-300 backdrop-blur animate-in fade-in duration-200">
          ✓ {feedback}
        </div>
      )}

      {avisoIa && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-fluid-xs font-semibold text-amber-300 backdrop-blur animate-in fade-in duration-200">
          ⚠ {avisoIa}
        </div>
      )}

      {/* ABA 1: Conexão e Regras */}
      {abaAtiva === "configuracoes" && (
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* Card de Conexão */}
          <div className="rounded-3xl border border-white/10 bg-ink-900/60 p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
              <div>
                <span className="text-[11px] uppercase font-bold tracking-wider text-brand-300">
                  Conexão Individual
                </span>
                <h2 className="text-fluid-lg font-bold text-mist-50">
                  WhatsApp do Consultor ({corretorNome})
                </h2>
                <p className="text-fluid-xs text-mist-400 mt-1">
                  Conecte o seu número pessoal para que sua IA atenda e qualifique leads diretamente no seu WhatsApp.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-fluid-xs font-semibold border ${
                    statusConexao === "conectado"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : statusConexao === "conectando"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-300 animate-pulse"
                      : "bg-red-500/10 border-red-500/30 text-red-300"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      statusConexao === "conectado"
                        ? "bg-emerald-400"
                        : statusConexao === "conectando"
                        ? "bg-amber-400"
                        : "bg-red-400"
                    }`}
                  />
                  {statusConexao === "conectado"
                    ? `Conectado: ${telefoneConectado}`
                    : statusConexao === "conectando"
                    ? "Aguardando Leitura"
                    : "Desconectado"}
                </span>

                {statusConexao === "conectado" ? (
                  <button
                    onClick={desconectar}
                    className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-fluid-xs font-semibold transition-colors border border-red-500/30 cursor-pointer"
                  >
                    Desconectar
                  </button>
                ) : (
                  <button
                    onClick={gerarQrCode}
                    className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-semibold transition-all shadow-md cursor-pointer"
                  >
                    Conectar via QR Code
                  </button>
                )}
              </div>
            </div>

            {mostrarQrCode && (
              <div className="p-6 rounded-2xl border border-brand-500/30 bg-ink-950/90 text-center space-y-4 max-w-md mx-auto">
                <h3 className="text-fluid-base font-bold text-white">Escaneie o QR Code com seu celular</h3>
                <p className="text-fluid-xs text-mist-400">
                  WhatsApp no celular ➔ Menu (Aparelhos conectados) ➔ Conectar um aparelho.
                </p>

                {conectando && (
                  <p className="text-fluid-xs text-mist-400 py-10">Falando com o provedor…</p>
                )}

                {!conectando && erroConexao && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
                    <p className="text-fluid-xs font-semibold text-amber-300">
                      Não é possível parear um número agora
                    </p>
                    <p className="text-[11px] text-mist-300 mt-1 leading-relaxed">{erroConexao}</p>
                  </div>
                )}

                {/* Só um QR vindo do provedor conecta de fato — um desenho
                    decorativo faria o corretor apontar o celular para nada. */}
                {!conectando && !erroConexao && qrCodeBase64 && (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI vinda do provedor, sem otimização possível.
                  <img
                    src={qrCodeBase64.startsWith("data:") ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
                    alt="QR Code para conectar o WhatsApp"
                    className="mx-auto w-48 h-48 bg-white p-3 rounded-2xl shadow-2xl"
                  />
                )}

                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => setMostrarQrCode(false)}
                    className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-mist-300 text-fluid-xs font-semibold cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Configurações da IA */}
          <div className="rounded-3xl border border-white/10 bg-ink-900/60 p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
            <div>
              <span className="text-[11px] uppercase font-bold tracking-wider text-brand-300">
                Regras de Inteligência Artificial
              </span>
              <h2 className="text-fluid-lg font-bold text-mist-50">
                Personalização do Agente Conversacional
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block">
                  Nome da Assistente
                </label>
                <input
                  type="text"
                  value={nomeAssistente}
                  onChange={(e) => setNomeAssistente(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-ink-950 px-4 py-2.5 text-fluid-sm text-mist-50 focus:border-brand-400 focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block">
                  Tom de Voz do Atendimento
                </label>
                <select
                  value={tomVoz}
                  onChange={(e) => setTomVoz(e.target.value as TomVozBot)}
                  className="w-full rounded-xl border border-white/15 bg-ink-950 px-4 py-2.5 text-fluid-sm text-mist-50 focus:border-brand-400 focus:outline-none cursor-pointer"
                >
                  <option value="consultivo_alto_padrao">Consultivo & Alto Padrão</option>
                  <option value="formal_direto">Formal & Direto</option>
                  <option value="descontraido_acolhedor">Descontraído & Acolhedor</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-fluid-xs font-bold text-mist-300 uppercase tracking-wider block">
                Modo de Ativação do Bot
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setModoBot("24_7")}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    modoBot === "24_7"
                      ? "border-brand-400 bg-brand-500/15 text-white"
                      : "border-white/10 bg-ink-950 text-mist-400 hover:text-white"
                  }`}
                >
                  <span className="text-lg block mb-1">🤖</span>
                  <h4 className="text-fluid-xs font-bold text-white">Sempre Ativo (24/7)</h4>
                </button>

                <button
                  type="button"
                  onClick={() => setModoBot("noturno_e_fds")}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    modoBot === "noturno_e_fds"
                      ? "border-brand-400 bg-brand-500/15 text-white"
                      : "border-white/10 bg-ink-950 text-mist-400 hover:text-white"
                  }`}
                >
                  <span className="text-lg block mb-1">🌙</span>
                  <h4 className="text-fluid-xs font-bold text-white">Noturno & Fim de Semana</h4>
                </button>

                <button
                  type="button"
                  onClick={() => setModoBot("co_piloto_3min")}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    modoBot === "co_piloto_3min"
                      ? "border-brand-400 bg-brand-500/15 text-white"
                      : "border-white/10 bg-ink-950 text-mist-400 hover:text-white"
                  }`}
                >
                  <span className="text-lg block mb-1">⏱️</span>
                  <h4 className="text-fluid-xs font-bold text-white">Modo Co-Piloto (3 min)</h4>
                </button>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 flex justify-end">
              <button
                onClick={salvarConfiguracoes}
                disabled={salvando}
                className="px-6 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white text-fluid-xs font-bold transition-all cursor-pointer"
              >
                {salvando ? "Salvando..." : "Salvar Configurações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: PLAYGROUND INTERATIVO AO VIVO */}
      {abaAtiva === "playground" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
          {/* Coluna 1 & 2: Chat Interativo Simulado do WhatsApp */}
          <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-ink-950/90 shadow-2xl overflow-hidden flex flex-col h-[600px]">
            {/* Header do WhatsApp */}
            <div className="bg-[#1f2c34] p-4 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-500 flex items-center justify-center font-bold text-white text-sm">
                  {nomeAssistente[0]}
                </div>
                <div>
                  <h4 className="text-fluid-sm font-bold text-white">{nomeAssistente} (IA)</h4>
                  <p className="text-[11px] text-emerald-400">
                    {iaDigitando ? "digitando..." : "online • assistente oficial"}
                  </p>
                </div>
              </div>

              <button
                onClick={() =>
                  setMensagensChat([
                    {
                      remetente: "bot",
                      texto: `Olá! Sou a ${nomeAssistente}, assistente pessoal do consultor ${corretorNome}. Como posso te ajudar hoje?`,
                      hora: "Agora",
                    },
                  ])
                }
                className="text-[11px] text-mist-400 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 cursor-pointer"
              >
                Reiniciar Chat
              </button>
            </div>

            {/* Balões de Conversa */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0b141a]">
              {mensagensChat.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.remetente === "cliente" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 space-y-2 text-fluid-xs shadow-md ${
                      m.remetente === "cliente"
                        ? "bg-[#005c4b] text-white rounded-br-none"
                        : "bg-[#202c33] text-mist-100 rounded-bl-none"
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p>

                    {/* Exibição de Anexos / Plantas */}
                    {m.anexos && m.anexos.length > 0 && (
                      <div className="pt-2 space-y-2 border-t border-white/10">
                        {m.anexos.map((anexo, i) => (
                          <div
                            key={i}
                            className="p-2.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base">📐</span>
                              <div>
                                <span className="font-bold text-white block text-[11px]">
                                  {anexo.titulo}
                                </span>
                                <span className="text-[10px] text-mist-400">PDF / Planta Oficial</span>
                              </div>
                            </div>
                            <span className="px-2.5 py-1 rounded-lg bg-brand-500 text-white text-[10px] font-bold">
                              Ver Planta
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <span className="text-[9px] text-mist-400 block text-right">{m.hora}</span>
                  </div>
                </div>
              ))}

              {iaDigitando && (
                <div className="flex justify-start">
                  <div className="bg-[#202c33] text-mist-300 rounded-2xl px-4 py-2.5 text-fluid-xs animate-pulse">
                    {nomeAssistente} está digitando...
                  </div>
                </div>
              )}
            </div>

            {/* Sugestões Rápidas de Teste */}
            <div className="p-2 bg-[#1f2c34] border-t border-white/10 flex gap-2 overflow-x-auto scrollbar-none">
              <button
                onClick={() =>
                  enviarMensagemPlayground(
                    "Olá, procuro um apartamento de 3 suítes em Alphaville até 2 milhões",
                  )
                }
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-mist-300 text-[11px] cursor-pointer"
              >
                💡 &quot;Procuro 3 suítes até 2M&quot;
              </button>
              <button
                onClick={() =>
                  enviarMensagemPlayground(
                    "Pode me enviar a planta do apartamento de 140m² do Canvas Alphaville?",
                  )
                }
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-mist-300 text-[11px] cursor-pointer"
              >
                📐 &quot;Me envie a planta do Canvas&quot;
              </button>
              <button
                onClick={() =>
                  enviarMensagemPlayground(
                    "Gostei muito. Gostaria de agendar uma visita para este sábado às 15h.",
                  )
                }
                className="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-mist-300 text-[11px] cursor-pointer"
              >
                📅 &quot;Agendar visita sábado 15h&quot;
              </button>
            </div>

            {/* Input de Mensagem */}
            <div className="p-3 bg-[#1f2c34] flex items-center gap-2">
              <input
                type="text"
                value={inputChat}
                onChange={(e) => setInputChat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarMensagemPlayground()}
                placeholder="Fingir ser um cliente e digitar mensagem..."
                className="flex-1 rounded-xl bg-[#2a3942] px-4 py-2.5 text-fluid-xs text-white placeholder:text-mist-500 focus:outline-none"
              />
              <button
                onClick={() => enviarMensagemPlayground()}
                className="p-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Coluna 3: Dossiê de Inteligência Atualizando em Tempo Real */}
          <div className="rounded-3xl border border-white/10 bg-ink-900/80 p-6 backdrop-blur space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-300">
                  Dossiê ao Vivo (IA)
                </span>
                {dossiePlayground.temperatura !== null && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Score {dossiePlayground.temperatura}/100
                  </span>
                )}
              </div>

              <h3 className="text-fluid-base font-bold text-white">
                Inteligência Comercial Extraída
              </h3>

              <div className="space-y-3">
                {dossiePlayground.resumo ? (
                  <div className="p-3 rounded-xl bg-ink-950 border border-white/10 space-y-0.5">
                    <span className="text-[10px] text-mist-500 uppercase font-bold">
                      📋 Resumo do Cliente
                    </span>
                    <p className="text-fluid-xs text-mist-100 whitespace-pre-line leading-relaxed">
                      {dossiePlayground.resumo}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-mist-500 leading-relaxed">
                    Mande uma mensagem no chat ao lado para a IA analisar o perfil do cliente e montar o dossiê aqui.
                  </p>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-brand-500/10 border border-brand-500/20">
              <span className="text-[10px] text-brand-300 font-bold uppercase block mb-1">
                💡 Por que testar?
              </span>
              <p className="text-[11px] text-mist-300 leading-relaxed font-light">
                Use este simulador para validar o tom de voz e garantir que a Sofia esteja recomendando exatamente os imóveis corretos antes de colocar o número em produção.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

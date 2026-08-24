"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { testarAgenteIA } from "../acoes";

/**
 * O playground — conversar com a IA antes de pôr o número no ar.
 *
 * Chama o MESMO agente que atende o cliente no WhatsApp (cascata de
 * provedores + catálogo real + guardrails), não uma simulação: é isso que
 * torna o teste um teste de verdade. Se um dia divergirem, o teste do
 * corretor vira mentira.
 */

type MensagemPlayground = {
  remetente: "cliente" | "bot";
  texto: string;
  hora: string;
  /** Qual modelo respondeu — o A/B mais barato entre os provedores da cascata. */
  modelo?: string | null;
  anexos?: { tipo: string; url: string; titulo: string }[];
};

const SUGESTOES = [
  "Olá, procuro um apartamento de 3 suítes em Alphaville até 2 milhões",
  "Pode me enviar a planta do apartamento de 140m² do Canvas Alphaville?",
  "Gostei muito. Gostaria de agendar uma visita para este sábado às 15h.",
];

/**
 * O que dizer quando a resposta veio da contingência.
 *
 * Estas frases nomeavam o Gemini em TODAS elas — foram escritas quando ele
 * era o único provedor. Hoje a cascata tem quatro, e o texto mandava o
 * corretor investigar a chave do Gemini por uma falha que podia ser de
 * qualquer um deles. A cascata só cai em contingência quando TODOS falham, e
 * é isso que as frases dizem agora.
 */
function explicarFallback(motivo?: string | null): string {
  switch (motivo) {
    case "timeout":
      return "Todos os provedores de IA passaram do tempo limite e a resposta veio pelo modo de contingência. Costuma ser passageiro — mande a mensagem de novo.";
    case "sem_api_key":
      return "Nenhum provedor de IA tem chave configurada neste ambiente (GROQ_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY ou OPENAI_API_KEY). A resposta veio pelo modo de contingência.";
    case "http_429":
      return "Todos os provedores de IA disponíveis estão no limite de uso agora — a resposta veio pelo modo de contingência. Configurar mais de um provedor evita isto.";
    case "http_4xx":
      return "Os provedores de IA recusaram a chamada (chave inválida, expirada ou sem permissão) e a resposta veio pelo modo de contingência. Confira as chaves no ambiente.";
    case "http_5xx":
      return "Os provedores de IA estão instáveis agora; a resposta veio pelo modo de contingência. Tente de novo em instantes.";
    case "resposta_vazia":
      return "A IA respondeu vazio e o texto veio pelo modo de contingência. Tente reformular a mensagem.";
    default:
      return "A IA respondeu pelo modo de contingência — este texto não reflete o agente real.";
  }
}

function saudacao(nomeAssistente: string, corretorNome: string): MensagemPlayground {
  return {
    remetente: "bot",
    texto: `Olá! Sou a ${nomeAssistente}, assistente do consultor ${corretorNome} da Next Home. Como posso te ajudar hoje?`,
    hora: "Agora",
  };
}

export function PlaygroundIA({
  nomeAssistente,
  corretorNome,
}: {
  nomeAssistente: string;
  corretorNome: string;
}) {
  const [mensagens, setMensagens] = useState<MensagemPlayground[]>([
    saudacao(nomeAssistente, corretorNome),
  ]);
  const [entrada, setEntrada] = useState("");
  const [digitando, setDigitando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [dossie, setDossie] = useState<{ resumo: string | null; temperatura: number | null }>({
    resumo: null,
    temperatura: null,
  });

  async function enviar(textoOpcao?: string) {
    const texto = textoOpcao || entrada;
    if (!texto.trim() || digitando) return;

    const historico = mensagens.map((m) => ({ remetente: m.remetente, texto: m.texto }));

    setMensagens((prev) => [...prev, { remetente: "cliente", texto, hora: "Agora" }]);
    setEntrada("");
    setDigitando(true);
    setAviso(null);

    const resposta = await testarAgenteIA(texto, historico);
    setDigitando(false);

    if ("erro" in resposta) {
      setAviso(resposta.erro);
      return;
    }

    // Uma resposta boa apaga o aviso da anterior: deixá-lo na tela faria
    // parecer que a IA continua quebrada.
    setAviso(resposta.iaAtiva ? null : explicarFallback(resposta.motivoFalha));

    setMensagens((prev) => [
      ...prev,
      {
        remetente: "bot",
        texto: resposta.texto,
        hora: "Agora",
        modelo: resposta.modelo,
        anexos: resposta.anexos.length > 0 ? resposta.anexos : undefined,
      },
    ]);

    setDossie({ resumo: resposta.resumoDossie, temperatura: resposta.score });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-titulo text-lg">Converse com a sua IA</h2>
          <p className="text-fluid-sm text-apoio mt-1">
            É o mesmo atendimento que o cliente recebe — mesmo catálogo, mesmas regras.
          </p>
        </div>
        <button
          onClick={() => {
            setMensagens([saudacao(nomeAssistente, corretorNome)]);
            setDossie({ resumo: null, temperatura: null });
            setAviso(null);
          }}
          className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha flex min-h-11 cursor-pointer items-center rounded-xl border px-4 transition-colors"
        >
          Recomeçar
        </button>
      </div>

      {aviso && (
        <p
          role="alert"
          className="text-fluid-xs text-alerta border-alerta-linha bg-alerta-lavado flex items-start gap-2 rounded-xl border px-4 py-3"
        >
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          {aviso}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* Chat com a cara do WhatsApp: o corretor reconhece o contexto na
            hora, e é o cenário real em que a resposta vai aparecer. */}
        <div className="border-linha flex h-[32rem] flex-col overflow-hidden rounded-2xl border">
          <div className="flex items-center gap-3 border-b border-linha bg-[#1f2c34] p-3">
            <span className="bg-acento flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white">
              {nomeAssistente[0]?.toUpperCase() ?? "S"}
            </span>
            <div className="min-w-0">
              <p className="text-fluid-sm truncate font-medium text-white">{nomeAssistente}</p>
              <p className="text-[11px] text-[#8696a0]">
                {digitando ? "digitando…" : "online"}
              </p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-[#0b141a] p-3">
            {mensagens.map((m, idx) => (
              <div
                key={idx}
                className={`flex ${m.remetente === "cliente" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`text-fluid-xs max-w-[85%] space-y-2 rounded-2xl p-3 shadow-md ${
                    m.remetente === "cliente"
                      ? "rounded-br-none bg-[#005c4b] text-white"
                      : "rounded-bl-none bg-[#202c33] text-white"
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p>

                  {m.anexos && m.anexos.length > 0 && (
                    <div className="space-y-1.5 border-t border-white/10 pt-2">
                      {m.anexos.map((anexo, i) => (
                        <p key={i} className="text-[11px] text-[#8696a0]">
                          📎 {anexo.titulo}
                        </p>
                      ))}
                    </div>
                  )}

                  <span className="block text-right text-[9px] text-[#8696a0]">
                    {/* Qual modelo respondeu. Com a cascata, a resposta pode
                        vir do provedor de reserva — e é aqui que se vê. */}
                    {m.modelo ? `${m.modelo} · ${m.hora}` : m.hora}
                  </span>
                </div>
              </div>
            ))}

            {digitando && (
              <div className="flex justify-start">
                <div className="text-fluid-xs animate-pulse rounded-2xl bg-[#202c33] px-4 py-2.5 text-[#8696a0]">
                  {nomeAssistente} está digitando…
                </div>
              </div>
            )}
          </div>

          <div className="scrollbar-none flex gap-2 overflow-x-auto border-t border-linha bg-[#1f2c34] p-2">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                onClick={() => enviar(s)}
                className="shrink-0 cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white/80 transition-colors hover:bg-white/20"
              >
                {s.length > 34 ? `${s.slice(0, 34)}…` : s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 bg-[#1f2c34] p-2.5">
            <input
              type="text"
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enviar()}
              placeholder="Escreva como se fosse o cliente…"
              aria-label="Mensagem do cliente"
              className="text-fluid-xs min-h-11 flex-1 rounded-xl bg-[#2a3942] px-4 text-white placeholder:text-[#8696a0] focus:outline-none"
            />
            <button
              onClick={() => enviar()}
              aria-label="Enviar"
              className="bg-acento hover:bg-acento-hover flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-5 w-5">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>

        {/* O que a IA entendeu do cliente. Começa vazio de propósito: um
            dossiê fictício faria o corretor validar uma leitura que a IA
            nunca fez. */}
        <div className="border-linha bg-superficie rounded-2xl border p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-fluid-sm text-titulo font-medium">O que a IA entendeu</h3>
            {dossie.temperatura !== null && (
              <span className="text-ok bg-ok-lavado border-ok-linha rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tabular-nums">
                {dossie.temperatura}/100
              </span>
            )}
          </div>

          {dossie.resumo ? (
            <p className="text-fluid-xs text-corpo mt-3 leading-relaxed whitespace-pre-line">
              {dossie.resumo}
            </p>
          ) : (
            <p className="text-fluid-xs text-tenue mt-3 leading-relaxed">
              Mande uma mensagem ao lado para a IA montar o perfil do cliente aqui — é o mesmo
              dossiê que aparece no funil.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

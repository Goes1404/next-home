"use client";

import { useEffect, useState, useTransition } from "react";
import { conectarWhatsappDaProspeccao, conferirWhatsappDosLeads, estadoDoWhatsappDaProspeccao } from "./acoes";

/**
 * O chip da prospecção (21/11/2026): conectar por QR Code (ou código de 8
 * letras, quando a pessoa está no próprio celular) e conferir, de uma vez, quem
 * da lista tem WhatsApp. Quem não tem vai para Perdido e não aparece mais
 * "Convidar para o WhatsApp" na hora de enviar.
 */
const BOTAO =
  "text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor inline-flex min-h-11 items-center justify-center rounded-full px-4 font-medium disabled:opacity-60";
const BOTAO_SECUNDARIO =
  "botao-secundario text-fluid-sm text-titulo inline-flex min-h-11 items-center rounded-full px-4 font-medium disabled:opacity-60";
const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

type Estado = { carregado: boolean; configurado: boolean; conectado: boolean; telefone: string | null };

async function seguro<T>(acao: () => Promise<T>): Promise<T | null> {
  try {
    return await acao();
  } catch {
    return null;
  }
}

function telefoneLegivel(t: string | null): string {
  if (!t) return "";
  const d = t.replace(/\D/g, "").replace(/^55/, "");
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d;
}

export function WhatsappDaProspeccao() {
  const [estado, setEstado] = useState<Estado>({ carregado: false, configurado: true, conectado: false, telefone: null });
  const [qr, setQr] = useState<string | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  async function atualizar() {
    const r = await seguro(() => estadoDoWhatsappDaProspeccao());
    if (r && r.ok) {
      setEstado({ carregado: true, configurado: r.configurado, conectado: r.conectado, telefone: r.telefone });
      if (r.conectado) {
        setQr(null);
        setCodigo(null);
      }
    } else setEstado((e) => ({ ...e, carregado: true }));
  }

  useEffect(() => {
    // Fora do corpo do efeito: a leitura é assíncrona (o estado muda depois).
    const timer = window.setTimeout(() => void atualizar(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Enquanto o QR (ou o código) está na tela, pergunta a cada 4 s se já conectou.
  useEffect(() => {
    if (!qr && !codigo) return;
    const timer = window.setInterval(() => void atualizar(), 4000);
    return () => window.clearInterval(timer);
  }, [qr, codigo]);

  function conectar(comNumero: boolean) {
    setErro(null);
    setMensagem(null);
    iniciar(async () => {
      const r = await seguro(() => conectarWhatsappDaProspeccao(comNumero ? telefone : undefined));
      if (!r) return setErro("Sem conexão com o servidor agora. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      if (r.jaConectado) return void atualizar();
      setQr(r.qrcode);
      setCodigo(r.codigo);
    });
  }

  function conferir() {
    setErro(null);
    setMensagem(null);
    iniciar(async () => {
      const r = await seguro(() => conferirWhatsappDosLeads());
      if (!r) return setErro("A conferência demorou demais ou a internet caiu. Tente de novo.");
      if (!r.ok) return setErro(r.erro);
      setMensagem(r.resumo);
    });
  }

  if (!estado.carregado) return null;

  return (
    <div className="cartao flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-titulo text-fluid-lg font-display">WhatsApp da prospecção</h2>
        <span className={`text-fluid-xs font-medium ${estado.conectado ? "text-ok" : "text-apoio"}`}>
          {estado.conectado ? `● Conectado ${telefoneLegivel(estado.telefone)}` : "○ Não conectado"}
        </span>
      </div>

      {!estado.configurado ? (
        <p className="text-fluid-sm text-apoio">O WhatsApp do sistema não está configurado neste ambiente.</p>
      ) : estado.conectado ? (
        <>
          <p className="text-fluid-sm text-corpo">
            Confira quem da lista tem WhatsApp antes de enviar. Quem não tem vai para Perdido e não aparece mais o
            &quot;Convidar para o WhatsApp&quot;. Só consulta: nenhuma mensagem sai.
          </p>
          <div>
            <button type="button" onClick={conferir} disabled={pendente} className={BOTAO}>
              {pendente ? "Conferindo… (pode levar 1 minuto)" : "Conferir quem tem WhatsApp"}
            </button>
          </div>
        </>
      ) : qr || codigo ? (
        <div className="flex flex-col gap-3">
          {codigo ? (
            <>
              <p className="text-fluid-sm text-corpo">
                No celular do chip: WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b> →{" "}
                <b>Conectar com número de telefone</b>, e digite:
              </p>
              <p className="text-titulo font-mono text-3xl tracking-[0.3em]">{codigo}</p>
            </>
          ) : (
            <>
              <p className="text-fluid-sm text-corpo">
                No celular do chip: WhatsApp → <b>Dispositivos conectados</b> → <b>Conectar dispositivo</b>, e aponte a
                câmera para o código:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- imagem em base64 que veio do provedor */}
              <img
                src={qr!.startsWith("data:") ? qr! : `data:image/png;base64,${qr}`}
                alt="QR Code para conectar o WhatsApp da prospecção"
                className="h-64 w-64 rounded-xl bg-white p-2"
              />
            </>
          )}
          <p className="text-fluid-xs text-apoio">Esperando a conexão… esta tela atualiza sozinha.</p>
          <div>
            <button type="button" onClick={() => conectar(Boolean(codigo))} disabled={pendente} className={BOTAO_SECUNDARIO}>
              Gerar outro código
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-fluid-sm text-corpo">
            Conecte o <b>chip de prospecção</b> (nunca o número central do CRM). Ele só serve para o sistema conferir
            quem tem WhatsApp; as mensagens você continua mandando pelo celular.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => conectar(false)} disabled={pendente} className={BOTAO}>
              {pendente ? "Gerando…" : "Conectar pelo QR Code"}
            </button>
          </div>
          <details className="text-fluid-sm text-corpo">
            <summary className="cursor-pointer">Está no próprio celular do chip? Conectar com código</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                className={CAMPO + " max-w-xs"}
                inputMode="tel"
                placeholder="Número do chip, com DDD"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
              />
              <button type="button" onClick={() => conectar(true)} disabled={pendente || telefone.replace(/\D/g, "").length < 10} className={BOTAO_SECUNDARIO}>
                Gerar código
              </button>
            </div>
          </details>
        </div>
      )}

      {mensagem && <p className="text-fluid-sm text-ok">{mensagem}</p>}
      {erro && (
        <p role="alert" className="text-fluid-xs text-perigo">
          {erro}
        </p>
      )}
    </div>
  );
}

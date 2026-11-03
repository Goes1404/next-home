"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { concluirConexaoPelaMeta } from "./acoes";

/**
 * "Conectar WhatsApp oficial" pela janela da Meta (Embedded Signup v4, F5).
 *
 * A janela devolve duas coisas por caminhos diferentes, e as duas são
 * necessárias:
 *   - o `code` (vale 30 s), no retorno do `FB.login`;
 *   - os ids da conta (WABA) e do número, por `postMessage` de
 *     `*.facebook.com` com `type: "WA_EMBEDDED_SIGNUP"`.
 * Quando as duas chegam, o servidor conclui (`concluirConexaoPelaMeta`).
 *
 * O PIN que o servidor gera vira a verificação em duas etapas do número: a
 * tela mostra uma vez, para o gestor anotar.
 */

type FB = {
  init: (opcoes: Record<string, unknown>) => void;
  login: (cb: (r: { authResponse?: { code?: string } }) => void, opcoes: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    FB?: FB;
    fbAsyncInit?: () => void;
  }
}

const SDK = "https://connect.facebook.net/pt_BR/sdk.js";

export function ConectarPelaMeta({ appId, configId, versao }: { appId: string; configId: string; versao: string }) {
  const [pronto, setPronto] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const ids = useRef<{ wabaId: string; phoneNumberId: string } | null>(null);
  const codigo = useRef<string | null>(null);
  const { avisar, falhar } = useAvisos();

  useEffect(() => {
    const iniciarSdk = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: versao });
      setPronto(true);
    };
    if (window.FB) {
      iniciarSdk();
    } else {
      window.fbAsyncInit = iniciarSdk;
      if (!document.querySelector(`script[src="${SDK}"]`)) {
        const s = document.createElement("script");
        s.src = SDK;
        s.async = true;
        s.defer = true;
        s.crossOrigin = "anonymous";
        document.body.appendChild(s);
      }
    }

    const aoReceber = (ev: MessageEvent) => {
      if (!ev.origin.endsWith("facebook.com")) return;
      let dados: { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string; error_message?: string } };
      try {
        dados = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      } catch {
        return;
      }
      if (dados?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (dados.event?.startsWith("FINISH") && dados.data?.waba_id && dados.data?.phone_number_id) {
        ids.current = { wabaId: dados.data.waba_id, phoneNumberId: dados.data.phone_number_id };
        concluirSePuder();
      } else if (dados.event === "ERROR") {
        falhar(`A Meta interrompeu a conexão: ${dados.data?.error_message ?? "erro sem detalhe"}.`);
      }
    };
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
    // `concluirSePuder` lê só refs; registrar uma vez basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, versao]);

  function concluirSePuder() {
    if (!codigo.current || !ids.current) return;
    const dados = { code: codigo.current, ...ids.current };
    codigo.current = null;
    iniciar(async () => {
      const r = await concluirConexaoPelaMeta(dados);
      if ("erro" in r) {
        falhar(r.erro);
        return;
      }
      setPin(r.pin);
      avisar(r.aviso ?? r.ok);
    });
  }

  function abrir() {
    window.FB?.login(
      (r) => {
        if (r.authResponse?.code) {
          codigo.current = r.authResponse.code;
          concluirSePuder();
        }
      },
      { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } },
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={abrir}
        disabled={!pronto || enviando}
        className="bg-acento hover:bg-acento-hover text-fluid-sm text-sobre-cor min-h-12 rounded-xl px-5 font-medium transition-colors disabled:opacity-60"
      >
        {enviando ? "Conectando…" : pronto ? "Conectar WhatsApp oficial pela Meta" : "Carregando a Meta…"}
      </button>
      {pin && (
        <p className="border-alerta-linha bg-alerta-lavado text-fluid-sm rounded-xl border p-3">
          Anote o PIN de verificação em duas etapas do número: <strong className="font-mono text-titulo">{pin}</strong>. Ele só
          aparece agora; a Meta pede este PIN se o número for registrado de novo.
        </p>
      )}
    </div>
  );
}

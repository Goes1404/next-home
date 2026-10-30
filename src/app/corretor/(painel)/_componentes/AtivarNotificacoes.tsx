"use client";

import { useEffect, useState, useTransition } from "react";
import { inscricaoDoPainel, registrarSwDoPainel } from "@/lib/painel/swDoPainel";
import { enviarNotificacaoDeTeste } from "./acoesDasNotificacoes";
import type { ResultadoDoTeste } from "./resultadoDoTeste";

/**
 * Liga a notificação no celular deste aparelho (0203).
 *
 * O aviso pelo WhatsApp sai do número do próprio corretor para ele mesmo e
 * cai na conversa "Você", sem notificação. Esta é a que chama a atenção:
 * lead novo, cliente esperando, lembretes. Some quando já está ligada.
 */

type Estado = "carregando" | "sem_suporte" | "iphone_fora_do_app" | "bloqueada" | "desligada" | "ligada" | "ligando" | "erro";

const CHAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function chaveEmBytes(base64: string): Uint8Array<ArrayBuffer> {
  const preenchido = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bruto = atob(preenchido.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

function ehIphoneForaDoApp(): boolean {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalado = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !instalado;
}

export function AtivarNotificacoes({ sempreVisivel = false }: { sempreVisivel?: boolean }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  // Ligou agora (no Início): o cartão fica, com o botão de teste, até sair da página.
  const [acabouDeLigar, setAcabouDeLigar] = useState(false);
  // Em que passo o "Ligar" parou (30/10/2026): sem isto, todo erro era a mesma frase.
  const [passoDoErro, setPassoDoErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<ResultadoDoTeste | null>(null);
  const [testando, iniciarTeste] = useTransition();

  function testar() {
    setTeste(null);
    iniciarTeste(async () => {
      try {
        setTeste(await enviarNotificacaoDeTeste());
      } catch {
        setTeste({ erro: "Não deu para enviar agora. Tente de novo." });
      }
    });
  }

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!CHAVE) return vivo && setEstado("sem_suporte");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return vivo && setEstado(ehIphoneForaDoApp() ? "iphone_fora_do_app" : "sem_suporte");
      }
      if (Notification.permission === "denied") return vivo && setEstado("bloqueada");
      // Olha o registro novo (`/corretor`) e o antigo (`/corretor/`): ver `swDoPainel.ts`.
      const inscricao = await inscricaoDoPainel();
      if (vivo) setEstado(inscricao ? "ligada" : "desligada");
    })().catch(() => vivo && setEstado("desligada"));
    return () => {
      vivo = false;
    };
  }, []);

  async function ligar() {
    if (!CHAVE) return;
    setEstado("ligando");
    setPassoDoErro(null);
    let passo = "pedir permissão";
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") return setEstado(permissao === "denied" ? "bloqueada" : "desligada");
      passo = "preparar o aparelho";
      const reg = await registrarSwDoPainel();
      passo = "inscrever o aparelho";
      const inscricao =
        (await inscricaoDoPainel()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(CHAVE) }));
      passo = "salvar no servidor";
      const resp = await fetch("/api/notificacoes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...inscricao.toJSON(), aparelho: navigator.userAgent }),
      });
      if (!resp.ok) {
        const corpo = (await resp.json().catch(() => null)) as { erro?: string } | null;
        setPassoDoErro(corpo?.erro ?? `o servidor respondeu ${resp.status}`);
        return setEstado("erro");
      }
      setEstado("ligada");
      setAcabouDeLigar(true);
    } catch (e) {
      setPassoDoErro(`falhou ao ${passo}${e instanceof Error && e.message ? ` (${e.message.slice(0, 80)})` : ""}`);
      setEstado("erro");
    }
  }

  if (estado === "carregando" || estado === "sem_suporte") return null;
  if (estado === "ligada" && !sempreVisivel && !acabouDeLigar) return null;

  return (
    <section className="cartao p-4 sm:p-5" aria-live="polite">
      <h2 className="text-fluid-base font-semibold text-titulo">Avisos no celular</h2>
      {estado === "ligada" ? (
        <>
          <p className="mt-1 text-fluid-sm text-corpo">
            Ligados neste aparelho. Lead novo, cliente que respondeu, visita daqui a 1 hora, lead parado e senha vencendo chegam como notificação.
          </p>
          <button
            type="button"
            onClick={testar}
            disabled={testando}
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-linha-forte px-5 text-fluid-sm font-semibold text-titulo disabled:opacity-60"
          >
            {testando ? "Enviando…" : "Enviar notificação de teste"}
          </button>
          {teste?.ok && <p className="mt-2 text-fluid-sm text-corpo">{teste.ok}</p>}
          {teste?.erro && <p className="mt-2 text-fluid-sm text-perigo">{teste.erro}</p>}
        </>
      ) : estado === "bloqueada" ? (
        <p className="mt-1 text-fluid-sm text-corpo">
          As notificações estão bloqueadas neste navegador. Libere em Configurações → Notificações do navegador e volte aqui.
        </p>
      ) : estado === "iphone_fora_do_app" ? (
        <p className="mt-1 text-fluid-sm text-corpo">
          No iPhone: toque em Compartilhar → <strong>Adicionar à Tela de Início</strong>, abra o painel por esse atalho e ligue aqui.
        </p>
      ) : (
        <>
          <p className="mt-1 text-fluid-sm text-corpo">
            Receba uma notificação quando chegar lead novo ou um cliente estiver esperando. O aviso pelo WhatsApp cai na sua própria conversa e não toca.
          </p>
          <button
            type="button"
            onClick={ligar}
            disabled={estado === "ligando"}
            className="botao-vivo mt-3 inline-flex min-h-11 items-center rounded-full bg-acento px-5 text-fluid-sm font-semibold text-sobre-cor disabled:opacity-60"
          >
            {estado === "ligando" ? "Ligando…" : "Ligar avisos neste celular"}
          </button>
          {estado === "erro" && (
            <p className="mt-2 text-fluid-sm text-perigo">
              Não deu para ligar agora{passoDoErro ? ` — ${passoDoErro}` : ""}. Recarregue a página e tente de novo; se repetir, mande um print desta mensagem ao suporte.
            </p>
          )}
        </>
      )}
    </section>
  );
}

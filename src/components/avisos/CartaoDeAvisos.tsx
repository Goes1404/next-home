"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { inscricaoDoPainel, registrarSwDoPainel } from "@/lib/painel/swDoPainel";

/**
 * O cartão "Ligar avisos neste celular", único para o corretor (0203) e para
 * quem administra a plataforma (0239). Antes eram duas cópias que já tinham
 * divergido; agora só mudam a rota que guarda a inscrição e os textos.
 *
 * Conserto de 04/11/2026 ("clico para ligar avisos e não aparece nada"):
 * - o pedido de permissão que volta "default" (fechado, ou que nem aparece,
 *   como no app Android e no Chrome com o pedido silencioso) deixava o cartão
 *   voltar ao normal em silêncio. Agora mostra como liberar nas configurações
 *   do celular e termina de ligar sozinho quando a pessoa volta;
 * - o pedido tem teto de 60 s (antes podia ficar "Ligando…" para sempre);
 * - a inscrição que já existe no aparelho é REGRAVADA no servidor ao abrir a
 *   tela. Na plataforma, o cartão dizia "ligados" porque o aparelho estava
 *   inscrito como corretor, mas a tabela da plataforma não tinha a inscrição;
 * - cada tentativa conta o passo em que parou a `/api/notificacoes/diagnostico`
 *   (logs da Vercel).
 */

type Estado =
  | "carregando"
  | "sem_suporte"
  | "iphone_fora_do_app"
  | "bloqueada"
  | "pedido_fechado"
  | "desligada"
  | "ligada"
  | "ligando"
  | "erro";

type ResultadoDoTeste = { ok?: string; erro?: string };

const CHAVE = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const TETO_DO_PEDIDO_MS = 60_000;

/** O que fazer com a resposta do pedido de permissão. */
export function estadoDepoisDoPedido(permissao: NotificationPermission | "sem_resposta"): "seguir" | "bloqueada" | "pedido_fechado" {
  if (permissao === "granted") return "seguir";
  if (permissao === "denied") return "bloqueada";
  return "pedido_fechado";
}

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

function ehAndroid(): boolean {
  return /android/i.test(navigator.userAgent);
}

function pedirPermissao(): Promise<NotificationPermission | "sem_resposta"> {
  return Promise.race([
    Notification.requestPermission(),
    new Promise<"sem_resposta">((resolve) => setTimeout(() => resolve("sem_resposta"), TETO_DO_PEDIDO_MS)),
  ]);
}

function relatarTentativa(dados: { resultado: string; passo?: string; erro?: string; onde: string }) {
  try {
    void fetch("/api/notificacoes/diagnostico", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...dados,
        permissao: typeof Notification !== "undefined" ? Notification.permission : "sem_api",
        app: window.matchMedia("(display-mode: standalone)").matches ? "instalado" : "navegador",
        aparelho: navigator.userAgent,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* sem diagnóstico, segue */
  }
}

async function guardarNoServidor(rota: string, inscricao: PushSubscription): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const resp = await fetch(rota, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...inscricao.toJSON(), aparelho: navigator.userAgent }),
  });
  if (resp.ok) return { ok: true };
  const corpo = (await resp.json().catch(() => null)) as { erro?: string } | null;
  return { ok: false, motivo: corpo?.erro ?? `o servidor respondeu ${resp.status}` };
}

export function CartaoDeAvisos({
  rota,
  onde,
  titulo,
  convite,
  rotuloDoBotao,
  textoLigado,
  dicaDoIphone,
  testar: acaoDeTeste,
  sempreVisivel = false,
}: {
  /** Onde a inscrição é guardada: `/api/notificacoes` (corretor) ou `/api/plataforma/notificacoes`. */
  rota: string;
  /** Rótulo curto para o diagnóstico (`painel` ou `plataforma`). */
  onde: string;
  titulo: string;
  convite: ReactNode;
  rotuloDoBotao: string;
  textoLigado: ReactNode;
  dicaDoIphone: ReactNode;
  testar: () => Promise<ResultadoDoTeste>;
  sempreVisivel?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>("carregando");
  // Ligou agora: o cartão fica, com o botão de teste, até sair da página.
  const [acabouDeLigar, setAcabouDeLigar] = useState(false);
  const [passoDoErro, setPassoDoErro] = useState<string | null>(null);
  const [teste, setTeste] = useState<ResultadoDoTeste | null>(null);
  const [testando, iniciarTeste] = useTransition();
  const ligando = useRef(false);

  function testar() {
    setTeste(null);
    iniciarTeste(async () => {
      try {
        setTeste(await acaoDeTeste());
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
      const inscricao = Notification.permission === "granted" ? await inscricaoDoPainel() : null;
      if (!inscricao) return vivo && setEstado("desligada");
      // Regrava: a inscrição do aparelho pode não estar NESTA tabela
      // (o mesmo celular ligado só como corretor, ou linha apagada).
      const r = await guardarNoServidor(rota, inscricao).catch(() => ({ ok: false as const, motivo: "sem rede" }));
      if (vivo) setEstado(r.ok ? "ligada" : "desligada");
    })().catch(() => vivo && setEstado("desligada"));
    return () => {
      vivo = false;
    };
  }, [rota]);

  async function ligar() {
    if (!CHAVE || ligando.current) return;
    ligando.current = true;
    setEstado("ligando");
    setPassoDoErro(null);
    let passo = "pedir permissão";
    try {
      const permissao = Notification.permission === "granted" ? "granted" : await pedirPermissao();
      const depois = estadoDepoisDoPedido(permissao);
      if (depois !== "seguir") {
        relatarTentativa({ onde, resultado: depois, passo, erro: String(permissao) });
        return setEstado(depois);
      }
      passo = "preparar o aparelho";
      const reg = await registrarSwDoPainel();
      passo = "inscrever o aparelho";
      const inscricao =
        (await inscricaoDoPainel()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(CHAVE) }));
      passo = "salvar no servidor";
      const r = await guardarNoServidor(rota, inscricao);
      if (!r.ok) {
        setPassoDoErro(r.motivo);
        relatarTentativa({ onde, resultado: "erro", passo, erro: r.motivo });
        return setEstado("erro");
      }
      relatarTentativa({ onde, resultado: "ligada" });
      setEstado("ligada");
      setAcabouDeLigar(true);
    } catch (e) {
      const detalhe = e instanceof Error && e.message ? e.message.slice(0, 80) : "";
      setPassoDoErro(`falhou ao ${passo}${detalhe ? ` (${detalhe})` : ""}`);
      relatarTentativa({ onde, resultado: "erro", passo, erro: detalhe });
      setEstado("erro");
    } finally {
      ligando.current = false;
    }
  }

  // Voltou das configurações do celular com a permissão liberada: termina
  // de ligar sozinho, sem precisar de outro toque.
  useEffect(() => {
    if (estado !== "pedido_fechado" && estado !== "bloqueada") return;
    function aoVoltar() {
      if (document.visibilityState !== "visible") return;
      if (Notification.permission === "granted") void ligar();
    }
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
    // `ligar` muda a cada render; o que importa é o estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  if (estado === "carregando" || estado === "sem_suporte") return null;
  if (estado === "ligada" && !sempreVisivel && !acabouDeLigar) return null;

  return (
    <section className="cartao p-4 sm:p-5" aria-live="polite">
      <h2 className="text-fluid-base font-semibold text-titulo">{titulo}</h2>
      {estado === "ligada" ? (
        <>
          <p className="mt-1 text-fluid-sm text-corpo">{textoLigado}</p>
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
      ) : estado === "bloqueada" || estado === "pedido_fechado" ? (
        <>
          <p className="mt-1 text-fluid-sm text-corpo">
            {estado === "bloqueada"
              ? "As notificações estão bloqueadas neste aparelho."
              : "O celular não mostrou o pedido de permissão (ou ele foi fechado)."}{" "}
            Para liberar:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-fluid-sm text-corpo">
            {ehAndroid() ? (
              <>
                <li>
                  Abra as <strong>Configurações</strong> do celular → <strong>Apps</strong> → o app da Astro (ou o Chrome, se abriu pelo navegador).
                </li>
                <li>
                  Toque em <strong>Notificações</strong> e ligue <strong>Permitir notificações</strong>.
                </li>
              </>
            ) : (
              <li>
                Toque no <strong>cadeado</strong> ao lado do endereço → <strong>Notificações</strong> → <strong>Permitir</strong>.
              </li>
            )}
            <li>Volte para esta tela: os avisos ligam sozinhos. Se não ligarem, toque no botão abaixo.</li>
          </ol>
          <button
            type="button"
            onClick={ligar}
            className="mt-3 inline-flex min-h-11 items-center rounded-full border border-linha-forte px-5 text-fluid-sm font-semibold text-titulo"
          >
            Tentar de novo
          </button>
        </>
      ) : estado === "iphone_fora_do_app" ? (
        <p className="mt-1 text-fluid-sm text-corpo">{dicaDoIphone}</p>
      ) : (
        <>
          <p className="mt-1 text-fluid-sm text-corpo">{convite}</p>
          <button
            type="button"
            onClick={ligar}
            disabled={estado === "ligando"}
            className="botao-vivo mt-3 inline-flex min-h-11 items-center rounded-full bg-acento px-5 text-fluid-sm font-semibold text-sobre-cor disabled:opacity-60"
          >
            {estado === "ligando" ? "Ligando…" : rotuloDoBotao}
          </button>
          {estado === "ligando" && (
            <p className="mt-2 text-fluid-sm text-corpo">Se aparecer um pedido de permissão, toque em <strong>Permitir</strong>.</p>
          )}
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

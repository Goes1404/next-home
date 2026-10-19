"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Send, Sparkles, X } from "lucide-react";
import { useAvisos } from "./Avisos";
import { moduloAtivo } from "./navegacao";
import { enviarMensagemPelaIA, rascunharMensagemPelaIA } from "./acoesMensagemPelaIA";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { cn } from "@/lib/utils";

/**
 * "A IA escreve e eu mando" (06/10/2026): o botão do cartão do funil e da
 * lista. A IA escreve o rascunho, o corretor lê, ajusta e envia num toque.
 * A IA não manda nada sozinha (regra N1): quem envia é a pessoa.
 *
 * A janela vai para o `<body>` por portal: o cartão do funil anima com
 * `transform`, e `fixed` dentro dele ficaria preso ao cartão. Por estar fora
 * da árvore, repete `data-rota` e `data-modulo` (navegacao.test.ts).
 */

const semAssinatura = () => () => {};

function falhaDeRede(erro: unknown): string {
  return ehActionDeOutroBuild(erro)
    ? avisoDePaginaVelha()
    : "Não foi possível falar com o servidor. Confira a internet e tente de novo.";
}

type Props = {
  leadId: string;
  nome: string;
  /** `icone`: círculo de 44px; `compacto`: botão com texto. */
  tamanho?: "icone" | "compacto";
  className?: string;
};

export function BotaoMensagemPelaIA({ leadId, nome, tamanho = "icone", className }: Props) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setAberto(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title="A IA escreve, você manda"
        aria-label={`A IA escreve uma mensagem para ${nome}`}
        className={cn(
          tamanho === "icone"
            ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            : "text-fluid-xs inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 font-medium",
          "border-acento-linha bg-acento-lavado text-acento-suave cursor-pointer border transition-opacity hover:opacity-85",
          className,
        )}
      >
        <Sparkles className="h-4.5 w-4.5" />
        {tamanho === "compacto" && <span>IA escreve</span>}
      </button>
      {aberto && <JanelaMensagemPelaIA leadId={leadId} nome={nome} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function JanelaMensagemPelaIA({
  leadId,
  nome,
  aoFechar,
}: {
  leadId: string;
  nome: string;
  aoFechar: () => void;
}) {
  const atual = usePathname();
  const modulo = moduloAtivo(atual);
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false);
  const router = useRouter();
  const { avisar } = useAvisos();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [escrevendo, iniciarEscrita] = useTransition();
  const [enviando, iniciarEnvio] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);

  function escrever() {
    setErro(null);
    iniciarEscrita(async () => {
      try {
        const r = await rascunharMensagemPelaIA(leadId);
        if (r.erro) setErro(r.erro);
        else if (r.texto) {
          setTexto(r.texto);
          requestAnimationFrame(() => campo.current?.focus());
        }
      } catch (e) {
        setErro(falhaDeRede(e));
      }
    });
  }

  function enviar() {
    if (!texto.trim() || enviando) return;
    setErro(null);
    iniciarEnvio(async () => {
      try {
        const r = await enviarMensagemPelaIA(leadId, texto);
        if (r.erro) {
          setErro(r.erro);
          return;
        }
        avisar(r.ok ?? "Mensagem enviada.");
        router.refresh();
        aoFechar();
      } catch (e) {
        setErro(falhaDeRede(e));
      }
    });
  }

  // O rascunho começa a ser escrito assim que a janela abre: abrir já é o pedido.
  const pediu = useRef(false);
  useEffect(() => {
    if (pediu.current) return;
    pediu.current = true;
    escrever();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !enviando) aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, enviando]);

  if (!noNavegador) return null;

  const ocupado = escrevendo || enviando;

  return createPortal(
    <div
      data-rota="painel"
      data-modulo={modulo ?? undefined}
      className="fixed inset-0 z-60"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar"
        onClick={() => !enviando && aoFechar()}
        className="absolute inset-0 h-full w-full bg-black/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Mensagem da IA para ${nome}`}
        className="border-linha bg-superficie pb-safe absolute inset-x-0 bottom-0 max-h-[90svh] overflow-y-auto rounded-t-3xl border-t px-5 pt-4 pb-6 sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[32rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase">A IA escreve, você manda</p>
            <p className="text-fluid-sm mt-1 truncate font-medium text-titulo">{nome}</p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            disabled={enviando}
            aria-label="Fechar"
            className="text-apoio hover:text-titulo flex h-11 w-11 shrink-0 items-center justify-center botao-icone"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label htmlFor={`rascunho-${leadId}`} className="sr-only">
          Mensagem
        </label>
        <textarea
          id={`rascunho-${leadId}`}
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={ocupado}
          rows={6}
          placeholder={escrevendo ? "A IA está escrevendo…" : "Escreva a mensagem"}
          className="text-fluid-sm border-linha bg-elevado mt-4 w-full resize-y rounded-2xl border px-4 py-3 break-words text-titulo focus:border-acento-linha focus:outline-none disabled:opacity-70"
        />

        {erro && (
          <p role="alert" className="text-fluid-xs text-perigo mt-2 break-words">
            {erro}
          </p>
        )}

        <p className="text-fluid-xs text-tenue mt-2">
          Respeita a cota e o espaçamento do seu número. Quando o lead responder, a IA assume.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={escrever}
            disabled={ocupado}
            className="text-fluid-sm border-linha text-corpo hover:border-linha-forte inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border px-4 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" /> {escrevendo ? "Escrevendo…" : "Escrever outra"}
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={ocupado || !texto.trim()}
            className="text-fluid-sm inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <Send className="h-4 w-4" /> {enviando ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

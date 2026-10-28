"use client";

import { Fragment, useRef } from "react";

/**
 * Texto com marcadores e a prévia ao lado, como o WhatsApp mostra (28/10/2026).
 * Usado na boas-vindas da roleta e no relatório do grupo: os marcadores viram
 * botões que entram onde está o cursor, em vez de uma frase com chaves para
 * o gestor copiar.
 */
export function EditorDeMensagem({
  rotulo,
  valor,
  aoMudar,
  marcadores,
  previa,
  placeholder,
  limite,
  linhas = 5,
  desabilitado = false,
  rodape,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (texto: string) => void;
  marcadores: readonly { chave: string; nome: string }[];
  /** O texto pronto, já com o exemplo no lugar dos marcadores. Vazio: nada sai. */
  previa: string;
  placeholder?: string;
  limite: number;
  linhas?: number;
  desabilitado?: boolean;
  rodape?: React.ReactNode;
}) {
  const campo = useRef<HTMLTextAreaElement>(null);

  function inserir(chave: string) {
    const el = campo.current;
    const marca = `{${chave}}`;
    if (!el) return aoMudar(valor + marca);
    const inicio = el.selectionStart ?? valor.length;
    const fim = el.selectionEnd ?? valor.length;
    aoMudar(valor.slice(0, inicio) + marca + valor.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(inicio + marca.length, inicio + marca.length);
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0 space-y-2.5">
        <label className="block space-y-1.5">
          <span className="text-fluid-xs font-semibold text-apoio">{rotulo}</span>
          <textarea
            ref={campo}
            rows={linhas}
            value={valor}
            placeholder={placeholder}
            maxLength={limite}
            disabled={desabilitado}
            onChange={(e) => aoMudar(e.target.value)}
            className="block w-full resize-y rounded-xl border border-linha-forte bg-superficie p-3 text-fluid-sm leading-relaxed text-titulo shadow-sm disabled:opacity-60"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-fluid-xs text-apoio">Inserir:</span>
          {marcadores.map((m) => (
            <button
              key={m.chave}
              type="button"
              disabled={desabilitado}
              onClick={() => inserir(m.chave)}
              className="inline-flex min-h-8 items-center rounded-full border border-linha-forte bg-superficie px-3 text-fluid-xs font-semibold text-acento shadow-sm hover:border-acento disabled:opacity-60"
            >
              + {m.nome}
            </button>
          ))}
        </div>
        <p className="text-fluid-xs text-apoio">
          {valor.length}/{limite} caracteres{rodape ? <> · {rodape}</> : null}
        </p>
      </div>

      <div className="min-w-0 space-y-1.5">
        <span className="text-fluid-xs font-semibold text-apoio">Como chega no WhatsApp</span>
        <div className="rounded-2xl border border-linha bg-vidro-forte p-3">
          {previa.trim() ? (
            <p className="ml-auto w-fit max-w-[92%] rounded-2xl rounded-tr-md bg-ok-lavado px-3 py-2 text-fluid-sm leading-relaxed break-words whitespace-pre-line text-titulo shadow-sm">
              <ComNegrito texto={previa} />
            </p>
          ) : (
            <p className="py-6 text-center text-fluid-xs text-apoio">Em branco: nada é enviado.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** `*assim*` vira negrito, como no WhatsApp. */
function ComNegrito({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {partes.map((p, i) =>
        /^\*[^*\n]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}

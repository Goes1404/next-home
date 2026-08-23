"use client";

import { useRef, useState, useTransition } from "react";

import { removerCatalogoCorretor, salvarCatalogoCorretor } from "./acoes";

/**
 * Catálogo em PDF do corretor.
 *
 * Nas conversas reais desta casa, a corretora manda um PDF com as opções em
 * vez de digitar uma lista no chat — e é isso que a IA passa a fazer quando
 * o cliente diz a região ou pergunta "o que vocês têm". Sem arquivo
 * cadastrado, ela simplesmente não manda: a ausência não vira erro.
 */
export function CatalogoDoCorretor({ inicial }: { inicial: { url: string; nome: string } | null }) {
  const [atual, setAtual] = useState(inicial);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function enviar(arquivo: File) {
    setAviso(null);
    const dados = new FormData();
    dados.set("arquivo", arquivo);
    iniciar(async () => {
      const r = await salvarCatalogoCorretor(dados);
      if (r.erro) {
        setAviso({ tipo: "erro", texto: r.erro });
        return;
      }
      if (r.url) setAtual({ url: r.url, nome: r.nome ?? "Catálogo" });
      setAviso({ tipo: "ok", texto: r.ok ?? "Salvo." });
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function remover() {
    setAviso(null);
    iniciar(async () => {
      const r = await removerCatalogoCorretor();
      if (r.erro) {
        setAviso({ tipo: "erro", texto: r.erro });
        return;
      }
      setAtual(null);
      setAviso({ tipo: "ok", texto: r.ok ?? "Removido." });
    });
  }

  return (
    <div className="rounded-3xl border border-linha bg-superficie p-6 sm:p-8 backdrop-blur shadow-xl space-y-4">
      <div>
        <span className="text-[11px] uppercase font-bold tracking-wider text-acento-suave">
          Material de apoio
        </span>
        <h2 className="text-fluid-lg font-bold text-titulo">Seu catálogo de produtos</h2>
        <p className="text-fluid-sm mt-1 text-tenue">
          Um PDF com as suas opções. A IA envia como documento do WhatsApp quando o cliente diz a
          região ou pergunta o que você tem — no lugar de digitar uma lista no chat.
        </p>
      </div>

      {atual ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-linha-forte bg-campo px-4 py-3">
          <span aria-hidden>📄</span>
          <a
            href={atual.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-fluid-sm flex-1 truncate text-titulo underline decoration-linha-forte underline-offset-4"
          >
            {atual.nome}
          </a>
          <button
            type="button"
            onClick={remover}
            disabled={salvando}
            className="text-fluid-xs rounded-lg border border-linha-forte px-3 py-1.5 text-tenue hover:text-titulo disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      ) : (
        <p className="text-fluid-sm text-tenue">Nenhum catálogo cadastrado ainda.</p>
      )}

      <div>
        <label
          className="text-fluid-xs font-bold uppercase tracking-wider text-corpo block mb-2"
          htmlFor="catalogo-arquivo"
        >
          {atual ? "Trocar arquivo" : "Enviar PDF"}
        </label>
        <input
          id="catalogo-arquivo"
          ref={inputRef}
          type="file"
          accept="application/pdf"
          disabled={salvando}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) enviar(arquivo);
          }}
          className="text-fluid-sm w-full rounded-xl border border-linha-forte bg-campo px-4 py-2.5 text-corpo file:mr-3 file:rounded-lg file:border-0 file:bg-acento file:px-3 file:py-1.5 file:text-fundo disabled:opacity-50"
        />
        <p className="text-fluid-xs mt-1 text-tenue">PDF, até 16 MB (limite do WhatsApp).</p>
      </div>

      {aviso && (
        <p
          className={`text-fluid-sm ${aviso.tipo === "erro" ? "text-perigo" : "text-sucesso"}`}
          role="status"
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}

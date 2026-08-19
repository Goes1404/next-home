"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Tema } from "@/lib/tema";
import { definirTema } from "@/lib/temaActions";

const OPCOES: { valor: Tema | null; rotulo: string }[] = [
  { valor: "claro", rotulo: "Usar tema claro" },
  { valor: "escuro", rotulo: "Usar tema escuro" },
  { valor: null, rotulo: "Seguir o tema do sistema" },
];

/** Fora do componente de propósito: o compilador do React não deixa mutar
 *  o DOM direto dentro de um handler. */
function aplicarTemaNoDom(tema: Tema | null) {
  if (tema === null) delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
}

/**
 * Três estados, um só controle: claro, escuro, ou seguir o sistema.
 *
 * `atual` vem do servidor (o cookie lido em `getTemaEscolhido`, repassado
 * por quem monta este componente) — não há `useState` espelhando o tema,
 * porque a fonte da verdade é sempre o cookie. Ao escolher, dois passos:
 * o `<html>` ganha o atributo na hora (sem esperar o servidor, para não
 * haver flash do tema antigo) e, em paralelo, a Server Function grava o
 * cookie e `router.refresh()` refaz a árvore server-side — é o que
 * sincroniza a cor da barra do navegador (`generateViewport`) e qualquer
 * outra leitura de `getTemaEscolhido` na página.
 */
export function SeletorTema({ atual }: { atual: Tema | null }) {
  const router = useRouter();
  const [, iniciar] = useTransition();

  function escolher(tema: Tema | null) {
    aplicarTemaNoDom(tema);

    iniciar(async () => {
      await definirTema(tema);
      router.refresh();
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="border-linha bg-superficie/60 inline-flex items-center gap-0.5 rounded-full border p-0.5"
    >
      {OPCOES.map((opcao) => {
        const marcado = atual === opcao.valor;
        return (
          <button
            key={opcao.rotulo}
            type="button"
            role="radio"
            aria-checked={marcado}
            aria-label={opcao.rotulo}
            title={opcao.rotulo}
            onClick={() => escolher(opcao.valor)}
            className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors ${
              marcado
                ? "bg-acento text-white"
                : "text-apoio hover:text-titulo hover:bg-veu/10"
            }`}
          >
            {opcao.valor === "claro" && <IconeSol aria-hidden className="h-4 w-4" />}
            {opcao.valor === "escuro" && <IconeLua aria-hidden className="h-4 w-4" />}
            {opcao.valor === null && <IconeSistema aria-hidden className="h-4 w-4" />}
          </button>
        );
      })}
    </div>
  );
}

function IconeSol(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function IconeLua(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function IconeSistema(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

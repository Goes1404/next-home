"use client";

import { useSyncExternalStore } from "react";
import { aplicarTemaNoDom, assinarTema, gravarCookieDoTema, lerEscolhaDoDom, TEMA_PADRAO, type Tema } from "@/lib/tema";

/*
 * Só claro e escuro (29/10/2026, pedido do dono): o terceiro botão ("padrão
 * do site", ícone de computador) confundia no app. Quem nunca escolheu vê o
 * padrão da casa marcado (`TEMA_PADRAO`), que é o que a página mostra.
 */
const OPCOES: { valor: Tema; rotulo: string }[] = [
  { valor: "claro", rotulo: "Usar tema claro" },
  { valor: "escuro", rotulo: "Usar tema escuro" },
];

/** No servidor (e durante a hidratação) ninguém sabe o cookie: sem escolha. */
const SEM_ESCOLHA = () => null;

/**
 * Dois estados, um só controle: claro ou escuro (até 29/10/2026 havia um
 * terceiro, "o padrão da casa").
 *
 * A fonte da verdade continua sendo o cookie — mas quem o lê agora é o
 * script inline do layout raiz, antes da primeira pintura, e ele deixa a
 * escolha no `<html>` (`data-tema-escolhido`). Este componente só OBSERVA o
 * DOM, por `useSyncExternalStore`: no servidor a página é estática e não
 * sabe o cookie (é isso que a torna cacheável, F2b), então o HTML sai com
 * "sem escolha" marcado e o navegador corrige no primeiro quadro depois da
 * hidratação. Não há `useState` espelhando o tema nem `setState` em efeito.
 *
 * Ao escolher: o `<html>`, a cor da barra e o `color-scheme` mudam na hora
 * (`aplicarTemaNoDom`), e o cookie é gravado pelo navegador para a PRÓXIMA
 * visita (`gravarCookieDoTema`). Nenhuma ida ao servidor: a página é
 * estática e nada nela depende do cookie lá — a Server Action que existia
 * aqui refazia a árvore da rota e devolvia o `<meta theme-color>` claro por
 * cima do escuro recém-aplicado (medido no navegador em 12/10/2026).
 */
export function SeletorTema() {
  const atual = useSyncExternalStore(assinarTema, lerEscolhaDoDom, SEM_ESCOLHA);

  const efetivo = atual ?? TEMA_PADRAO;

  function escolher(tema: Tema) {
    aplicarTemaNoDom(tema);
    gravarCookieDoTema(tema);
  }

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="border-linha bg-superficie/60 inline-flex items-center gap-0.5 rounded-full border p-0.5"
    >
      {OPCOES.map((opcao) => {
        const marcado = efetivo === opcao.valor;
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


"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CHAVE_TEMA, type Tema, aplicarTema, ehTema } from "./tema";

/**
 * Alterna claro/escuro dentro do painel.
 *
 * A fonte da verdade é o atributo `data-tema` no <html> — quem o escreve
 * primeiro é o script inline do layout raiz, antes da primeira pintura. Ler
 * o DOM com `useSyncExternalStore` em vez de guardar uma cópia em `useState`
 * evita duas coisas: o estado do botão divergir do tema real (o AreaTema
 * também escreve o atributo, ao trocar de rota) e o React reclamar de
 * hidratação, já que o servidor não enxerga `localStorage`.
 */
export function AlternadorTema() {
  const tema = useSyncExternalStore(observarTema, lerTemaDoDom, () => null);

  const alternar = useCallback(() => {
    const proximo: Tema = tema === "claro" ? "escuro" : "claro";
    aplicarTema(proximo);
    try {
      localStorage.setItem(CHAVE_TEMA, proximo);
    } catch {
      // Sem persistência a escolha vale só nesta aba. Ainda funciona.
    }
  }, [tema]);

  const claro = tema === "claro";
  const rotulo = claro ? "Usar tema escuro" : "Usar tema claro";

  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={claro}
      aria-label={rotulo}
      title={rotulo}
      className="border-linha text-apoio hover:border-linha-forte hover:text-titulo flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors"
    >
      {/* Os dois ícones ficam empilhados e trocam por opacidade e rotação:
          um `&&` faria o botão mudar de largura no clique e a barra do topo
          tremer junto. */}
      <span className="relative block h-4.5 w-4.5">
        <IconeSol
          aria-hidden
          className={`absolute inset-0 h-full w-full transition-[opacity,rotate] duration-300 ${
            claro ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"
          }`}
        />
        <IconeLua
          aria-hidden
          className={`absolute inset-0 h-full w-full transition-[opacity,rotate] duration-300 ${
            claro ? "rotate-90 opacity-0" : "rotate-0 opacity-100"
          }`}
        />
      </span>
    </button>
  );
}

function lerTemaDoDom(): Tema | null {
  const valor = document.documentElement.dataset.tema;
  return ehTema(valor) ? valor : null;
}

/** Reage a qualquer escrita em `data-tema`, venha do botão ou do AreaTema. */
function observarTema(aoMudar: () => void): () => void {
  const observador = new MutationObserver(aoMudar);
  observador.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-tema"],
  });
  return () => observador.disconnect();
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

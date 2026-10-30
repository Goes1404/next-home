"use client";

import { useSyncExternalStore } from "react";
import { useGuardadoNoAparelho } from "@/lib/navegador/guardadoNoAparelho";
import { mostrarGuiaDoIphone } from "@/lib/marcaDoCrm/iphone";

const CHAVE_FECHADO = "astro:guia-iphone-fechado";
const nada = () => () => {};

/** Lido no navegador; no servidor (e na hidratação) ninguém sabe o aparelho. */
function lerAparelho(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return mostrarGuiaDoIphone({
    userAgent: nav.userAgent,
    toques: nav.maxTouchPoints,
    instalado: nav.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches === true,
  });
}

/**
 * "Instalar no iPhone" (29/10/2026). O iPhone não tem o botão "Instalar" do
 * Android: o app nasce do menu Compartilhar do Safari. Sem esse caminho, o
 * corretor no iPhone usa o CRM numa aba, sem avisos (o iOS só manda push a
 * app da Tela de Início) e sem a tela sem internet.
 *
 * Aparece SÓ no Safari do iPhone/iPad e só fora do app (`mostrarGuiaDoIphone`).
 * Fechar vale para este aparelho (localStorage protegido). Enquanto o app da
 * App Store não existe (`docs/APP-IOS.md`), é este o app do iPhone.
 */
export function InstalarNoIphone() {
  const mostrar = useSyncExternalStore(nada, lerAparelho, () => false);
  const [fechado, fechar] = useGuardadoNoAparelho(CHAVE_FECHADO);
  if (!mostrar || fechado !== null) return null;

  return (
    <section className="cartao p-4 sm:p-5" aria-labelledby="instalar-no-iphone">
      <div className="flex items-start justify-between gap-3">
        <h2 id="instalar-no-iphone" className="text-fluid-base text-titulo font-semibold">
          Instale o app no iPhone
        </h2>
        <button
          type="button"
          onClick={() => fechar("1")}
          aria-label="Fechar o guia de instalação"
          className="botao-icone text-apoio hover:text-titulo -mt-2 -mr-2 grid min-h-11 min-w-11 shrink-0 cursor-pointer place-items-center rounded-full"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <p className="text-fluid-sm text-corpo mt-1">
        Abre em tela cheia, recebe avisos de lead novo e mostra a agenda mesmo sem internet.
      </p>
      <ol className="text-fluid-sm text-corpo mt-3 space-y-2">
        <li className="flex items-center gap-3">
          <span className="bg-acento-lavado text-acento-suave grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold">1</span>
          <span>
            Toque em <strong className="text-titulo">Compartilhar</strong>
            <svg viewBox="0 0 24 24" aria-label="(ícone do quadrado com seta para cima)" role="img" className="text-acento-suave mx-1 inline h-5 w-5 align-[-4px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M8 7l4-4 4 4" />
              <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
            </svg>
            na barra do Safari.
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="bg-acento-lavado text-acento-suave grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold">2</span>
          <span>
            Role e escolha <strong className="text-titulo">Adicionar à Tela de Início</strong>.
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="bg-acento-lavado text-acento-suave grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold">3</span>
          <span>
            Toque em <strong className="text-titulo">Adicionar</strong> e abra pelo ícone da Astro.
          </span>
        </li>
      </ol>
    </section>
  );
}

"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Um valor guardado no navegador da pessoa (localStorage), para
 * conveniências de quem olha a tela — "fechei este aviso", "ocultei os
 * primeiros passos" (29/10/2026). Nunca para estado que precisa valer em
 * outro aparelho.
 *
 * Todo acesso ao storage é protegido: ele pode lançar (modo privado, dados
 * bloqueados) e a tela tem de funcionar igual sem ele — aí o valor vale só
 * até recarregar.
 *
 * `useSyncExternalStore` com o retrato do SERVIDOR `undefined`: na primeira
 * pintura ninguém sabe o que está guardado, e quem usa decide o que mostrar
 * enquanto isso (em geral, nada — melhor que mostrar e sumir).
 */

const EVENTO = "astro:guardado-no-aparelho";
/** Quando o storage falha, o valor fica aqui até recarregar. */
const naMemoria = new Map<string, string | null>();

function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return naMemoria.get(chave) ?? null;
  }
}

function gravar(chave: string, valor: string | null) {
  naMemoria.set(chave, valor);
  try {
    if (valor === null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, valor);
  } catch {
    /* sem storage: vale o da memória */
  }
  window.dispatchEvent(new Event(EVENTO));
}

function ouvir(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO, aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener(EVENTO, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

/**
 * `[valor, gravar]`. `valor` é `undefined` no servidor e na hidratação, e
 * depois a string guardada (ou `null`).
 */
export function useGuardadoNoAparelho(chave: string): [string | null | undefined, (valor: string | null) => void] {
  const valor = useSyncExternalStore<string | null | undefined>(
    ouvir,
    () => ler(chave),
    () => undefined,
  );
  const definir = useCallback((v: string | null) => gravar(chave, v), [chave]);
  return [valor, definir];
}

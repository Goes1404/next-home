"use client";

import { useEffect } from "react";

/**
 * Desfaz o véu da saída animada (`html[data-saindo]`, globals.css) quando a
 * tela de acesso monta (29/10/2026). O "Sair" é uma Server Action que
 * redireciona SEM recarregar a página: o atributo no `<html>` sobreviveria
 * à navegação e o véu cobriria o login para sempre. Aqui ele vira "fim"
 * (o véu esmaece) e sai depois da animação.
 *
 * Também apaga os dados do app sem internet (29/10/2026, segunda leva): toda
 * tela de acesso manda `limpar-dados` ao service worker do painel. É o fim
 * do caminho do "Sair" (a action redireciona para cá) e cobre a sessão que
 * venceu sem ninguém clicar em sair — a próxima pessoa a entrar neste
 * aparelho não vê a agenda nem os leads da anterior.
 */
export function LimparSaida() {
  useEffect(() => {
    try {
      navigator.serviceWorker?.controller?.postMessage({ tipo: "limpar-dados" });
      window.sessionStorage.removeItem("astro:offline-renovado-em");
    } catch {
      /* sem service worker ou sem storage: nada guardado para limpar */
    }

    const html = document.documentElement;
    if (!html.hasAttribute("data-saindo")) return;
    html.setAttribute("data-saindo", "fim");
    const t = window.setTimeout(() => html.removeAttribute("data-saindo"), 400);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";
import { ehChaveDasRecentes } from "@/lib/painel/buscaRapida";
import { avisarServiceWorkers } from "@/lib/painel/swDoPainel";

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
      // Ao worker ATIVO de cada registro do painel, não só ao `controller`:
      // a página de login pode não ter controlador (ver `swDoPainel.ts`).
      void avisarServiceWorkers({ tipo: "limpar-dados" });
      window.sessionStorage.removeItem("astro:offline-renovado-em");
    } catch {
      /* sem storage de sessão */
    }
    try {
      // As buscas recentes (nomes de clientes) de quem usou este aparelho.
      const local = window.localStorage;
      for (let i = local.length - 1; i >= 0; i--) {
        const chave = local.key(i);
        if (ehChaveDasRecentes(chave)) local.removeItem(chave!);
      }
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

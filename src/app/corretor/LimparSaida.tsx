"use client";

import { useEffect } from "react";

/**
 * Desfaz o véu da saída animada (`html[data-saindo]`, globals.css) quando a
 * tela de acesso monta (29/10/2026). O "Sair" é uma Server Action que
 * redireciona SEM recarregar a página: o atributo no `<html>` sobreviveria
 * à navegação e o véu cobriria o login para sempre. Aqui ele vira "fim"
 * (o véu esmaece) e sai depois da animação.
 */
export function LimparSaida() {
  useEffect(() => {
    const html = document.documentElement;
    if (!html.hasAttribute("data-saindo")) return;
    html.setAttribute("data-saindo", "fim");
    const t = window.setTimeout(() => html.removeAttribute("data-saindo"), 400);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PREFIXO_PAINEL, aplicarTema, temaPreferido } from "./tema";

/** Precisam casar com `--color-fundo` de cada tema em `globals.css`. */
const COR_BARRA_ESCURA = "#040b0a";
const COR_BARRA_CLARA = "#edf2f0";

/**
 * Mantém `data-area` e `data-tema` no <html> em sincronia com a rota.
 *
 * O script inline do layout raiz acerta a primeira pintura; este componente
 * cuida do resto da sessão, porque em navegação client-side o <head> não
 * roda de novo. Sem ele, sair do painel para o site público levaria o tema
 * claro junto — e a home ficaria com fundo de papel atrás do vídeo.
 */
export function AreaTema() {
  const rota = usePathname();

  useEffect(() => {
    const raiz = document.documentElement;
    const noPainel = rota?.startsWith(PREFIXO_PAINEL) ?? false;

    raiz.dataset.area = noPainel ? "painel" : "site";
    if (noPainel) aplicarTema(temaPreferido());
    else delete raiz.dataset.tema;

    // A barra do navegador no celular pinta a cor do <meta>, não a do CSS:
    // sem isso o painel claro fica com uma faixa preta no topo do Chrome.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute(
        "content",
        raiz.dataset.tema === "claro" ? COR_BARRA_CLARA : COR_BARRA_ESCURA,
      );
    }
  }, [rota]);

  return null;
}

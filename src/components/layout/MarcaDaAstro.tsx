"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { ATRIBUTO_DA_ASTRO, ehDocumentoDaAstro } from "@/lib/marcaDaAstro";

/**
 * Mantém `data-documento-astro` no `<html>` em dia a cada navegação (o
 * script inline do layout raiz cuida só da primeira carga). Ver
 * `lib/marcaDaAstro.ts`.
 */
export function MarcaDaAstro({ enderecosDoPainel }: { enderecosDoPainel: string[] }) {
  const caminho = usePathname();
  useEffect(() => {
    const noPainel = enderecosDoPainel.includes(window.location.hostname.toLowerCase());
    const raiz = document.documentElement;
    if (ehDocumentoDaAstro(caminho, noPainel)) raiz.setAttribute(ATRIBUTO_DA_ASTRO, "");
    else raiz.removeAttribute(ATRIBUTO_DA_ASTRO);
  }, [caminho, enderecosDoPainel]);
  return null;
}

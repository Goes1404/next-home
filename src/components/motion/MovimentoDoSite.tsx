"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

/*
 * O relógio de movimento do site (Lenis + ScrollTrigger, em `SmoothScroll`)
 * só é montado FORA do painel.
 *
 * Até 12/10/2026 o `SmoothScroll` era importado direto pelo layout raiz —
 * e o layout raiz vale para toda rota, inclusive `/corretor/**`. O painel não
 * tem uma camada de parallax, um Reveal nem um ScrollTrigger, mas pagava o
 * GSAP, o plugin e o Lenis em toda tela (~120 KB de JavaScript decodificado,
 * medido pelo manifesto do build). O que o painel usa do Lenis é só o
 * `rolarAoTopo`/`recalcularRolagem` de `lenis.ts`, que já degradam para o
 * scroll nativo quando não há instância.
 *
 * `next/dynamic` em vez de um `if` em volta do import: o `if` esconde o
 * componente, não o chunk — o JavaScript continuaria no primeiro
 * carregamento de toda rota. Só o import assíncrono tira o peso do manifesto.
 *
 * A comparação é por SEGMENTO, não por prefixo de texto: `startsWith(
 * "/corretor")` engoliria `/corretores` e `/corretores/<slug>`, páginas
 * PÚBLICAS da equipe — a mesma armadilha que fez a onda de transição sumir
 * delas em 10/09/2026 (ver OndaDeTransicao.tsx).
 */
const SmoothScroll = dynamic(() => import("./SmoothScroll").then((m) => m.SmoothScroll), {
  ssr: false,
});

function ehPainel(caminho: string): boolean {
  return caminho === "/corretor" || caminho.startsWith("/corretor/");
}

export function MovimentoDoSite() {
  const caminho = usePathname();
  if (ehPainel(caminho)) return null;
  return <SmoothScroll />;
}

import type Lenis from "lenis";

/**
 * Instância ativa do Lenis.
 *
 * O Lenis assume o scroll da página e desliga o `scroll-behavior: smooth`
 * nativo (ver `.lenis.lenis-smooth` em globals.css). Sem uma referência a
 * ele, links de âncora saltam secamente. Guardar a instância aqui deixa
 * qualquer componente pedir uma rolagem suave de verdade.
 */
let instancia: Lenis | null = null;

export function registrarLenis(l: Lenis | null): void {
  instancia = l;
}

/** Deslocamento para o topo não ficar embaixo do header fixo. */
const OFFSET_HEADER = -88;

export function rolarPara(id: string): void {
  const alvo = document.getElementById(id);
  if (!alvo) return;

  if (instancia) {
    instancia.scrollTo(alvo, { offset: OFFSET_HEADER, duration: 1 });
    return;
  }
  // Sem Lenis (movimento reduzido, ou antes da hidratação) o `scroll-mt`
  // das seções já cuida do offset.
  alvo.scrollIntoView({ behavior: "smooth", block: "start" });
}

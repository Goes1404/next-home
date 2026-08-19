"use client";

import { useSyncExternalStore } from "react";

export type ModoVidro = "webgl" | "css";

type NavigatorEstendido = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

let suporteWebgl2: boolean | null = null;

/** Testa WebGL2 uma única vez por sessão e descarta o contexto. */
function temWebgl2(): boolean {
  if (suporteWebgl2 !== null) return suporteWebgl2;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    suporteWebgl2 = gl !== null;
    // Libera o contexto imediatamente: o navegador limita quantos existem.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    suporteWebgl2 = false;
  }
  return suporteWebgl2;
}

/** A leitura em vigor: o atributo do `<html>` vence a preferência do sistema. */
function temaClaro(): boolean {
  const escolhido = document.documentElement.dataset.tema;
  if (escolhido) return escolhido === "claro";
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

function decidir(): ModoVidro {
  const nav = navigator as NavigatorEstendido;

  /*
   * O shader é escrito para vidro sobre fundo escuro: soma brilho na borda e
   * pinta o fundo procedural com um quase-preto fixo. Sobre fundo claro isso
   * não tem conserto por parâmetro — brilho branco sobre branco não desenha
   * nada —, então a leitura clara usa o fallback em CSS, que já tem receita
   * própria (`--claro-vidro-*` no globals.css). Reescrever o shader para os
   * dois fundos é trabalho à parte, e opcional: o fallback é bom o bastante
   * que painel e card já o usam por escolha visual, não por limitação.
   */
  if (temaClaro()) return "css";

  // Preferências declaradas do usuário vêm antes de qualquer heurística.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "css";
  if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) return "css";
  if (nav.connection?.saveData) return "css";

  // Aparelho modesto: o custo do shader não compensa.
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4) {
    return "css";
  }
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4) return "css";

  return temWebgl2() ? "webgl" : "css";
}

const CONSULTAS = [
  "(prefers-reduced-motion: reduce)",
  "(prefers-reduced-transparency: reduce)",
  // Quem está em "seguir o sistema" e troca o tema do SO com o site aberto
  // precisa ver o vidro trocar de receita junto.
  "(prefers-color-scheme: light)",
] as const;

function subscribe(aoMudar: () => void): () => void {
  const consultas = CONSULTAS.map((q) => window.matchMedia(q));
  consultas.forEach((c) => c.addEventListener("change", aoMudar));
  return () => consultas.forEach((c) => c.removeEventListener("change", aoMudar));
}

function getServerSnapshot(): ModoVidro {
  return "css";
}

/**
 * Decide entre o vidro em WebGL e o fallback em CSS.
 *
 * `useSyncExternalStore` resolve a hidratação sem gambiarra: o servidor não
 * conhece `navigator`/`matchMedia`, então a primeira pintura do cliente usa
 * `getServerSnapshot` ("css") para bater com o HTML recebido, e o React
 * corrige para o valor real logo em seguida — sem o flash de um `useEffect`
 * manual chamando `setState`.
 */
export function useGlassFallback(): ModoVidro {
  return useSyncExternalStore(subscribe, decidir, getServerSnapshot);
}

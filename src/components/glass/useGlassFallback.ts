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

function decidir(): ModoVidro {
  const nav = navigator as NavigatorEstendido;

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

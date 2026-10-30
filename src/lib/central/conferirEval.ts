import type { ChamadaFeita } from "./cerebro";

/**
 * A régua do eval do central (`npm run eval:central`; plano da onda 0,
 * Task 9). Pura: o script roda o modelo, e aqui só se compara o que ele
 * pediu com o que o caso espera.
 *
 * - ferramenta `null`: nenhuma chamada (recusa, fora do CRM, falta dado);
 * - lista: pedido composto, a primeira chamada pode ser qualquer uma;
 * - argumento texto: o esperado aparece dentro do que veio, sem acento e
 *   sem caixa ("joão" casa com "João Pereira");
 * - argumento número: até 1% de diferença ("480 mil" → 480000).
 */
export type CasoDoCentral = {
  id: string;
  papel: "corretor" | "gestor";
  mensagem: string;
  historico?: { papel: "pessoa" | "central"; texto: string }[];
  ferramentaEsperada: string | string[] | null;
  argumentosEsperados?: Record<string, string | number>;
  nota?: string;
};

export type ConferenciaDoCaso = {
  ferramentaOk: boolean;
  /** `null` quando o caso não espera argumentos ou a ferramenta já errou. */
  argumentosOk: boolean | null;
  pedida: string | null;
  argumentosErrados: string[];
};

const normal = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function argumentoConfere(esperado: string | number, veio: unknown): boolean {
  if (typeof esperado === "number") {
    const n = typeof veio === "number" ? veio : Number(String(veio ?? "").replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && Math.abs(n - esperado) <= Math.abs(esperado) * 0.01;
  }
  return normal(veio).includes(normal(esperado));
}

export function conferirCaso(caso: CasoDoCentral, chamadas: ChamadaFeita[]): ConferenciaDoCaso {
  const primeira = chamadas[0] ?? null;
  const pedida = primeira?.nome ?? null;
  const esperada = caso.ferramentaEsperada;
  const ferramentaOk =
    esperada === null ? pedida === null : Array.isArray(esperada) ? pedida !== null && esperada.includes(pedida) : pedida === esperada;

  const esperados = Object.entries(caso.argumentosEsperados ?? {});
  if (!ferramentaOk || !primeira || esperados.length === 0) {
    return { ferramentaOk, argumentosOk: null, pedida, argumentosErrados: [] };
  }
  const argumentosErrados = esperados.filter(([k, v]) => !argumentoConfere(v, primeira.argumentos[k])).map(([k]) => k);
  return { ferramentaOk, argumentosOk: argumentosErrados.length === 0, pedida, argumentosErrados };
}

/**
 * O que o formulário público manda além de nome e contato: os critérios do
 * "me avise quando surgir" e os favoritos. Módulo puro para ser testável —
 * rota do app só pode exportar os métodos HTTP.
 */

/** Critérios do "me avise": números finitos e positivos, texto curto. */
export function parseInteresse(i: { regiao?: unknown; dormitoriosMin?: unknown; precoMax?: unknown } | undefined): {
  regiao_interesse: string | null;
  dormitorios_min: number | null;
  orcamento_max: number | null;
} {
  const num = (v: unknown, max: number) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null;
  };
  const regiao = typeof i?.regiao === "string" ? i.regiao.trim().slice(0, 80) : "";
  return {
    regiao_interesse: regiao || null,
    dormitorios_min: num(i?.dormitoriosMin, 10),
    orcamento_max: num(i?.precoMax, 100_000_000),
  };
}

/** Só slugs com cara de slug, no máximo 12. */
export function parseFavoritos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{2,120}$/.test(s)))].slice(0, 12);
}


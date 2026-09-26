/**
 * Unidades de um empreendimento (26/09/2026) — regras puras.
 *
 * O corretor cadastra em lote colando como ele fala: "101, 102, 103",
 * "101 a 104" ou uma por linha. Faixa numérica vira as unidades do meio;
 * faixa absurda (mais de 200) é recusada — é erro de digitação, não prédio.
 */

export type StatusUnidade = "disponivel" | "reservada" | "vendida";

export const STATUS_UNIDADE_LABEL: Record<StatusUnidade, string> = {
  disponivel: "Disponível",
  reservada: "Reservada",
  vendida: "Vendida",
};

export const TETO_DO_LOTE = 200;

/** Identificações a partir do texto colado. Devolve `null` se o lote passa do teto. */
export function lerIdentificacoes(texto: string): string[] | null {
  const saida: string[] = [];
  for (const parte of texto.split(/[,;\n]+/)) {
    const p = parte.trim();
    if (!p) continue;
    const faixa = p.match(/^(\d+)\s*(?:a|-|até|ate)\s*(\d+)$/i);
    if (faixa) {
      const [a, b] = [Number(faixa[1]), Number(faixa[2])];
      const [ini, fim] = a <= b ? [a, b] : [b, a];
      if (fim - ini + 1 > TETO_DO_LOTE) return null;
      for (let n = ini; n <= fim; n++) saida.push(String(n));
      continue;
    }
    saida.push(p.slice(0, 40));
  }
  const unicas = [...new Set(saida)];
  return unicas.length > TETO_DO_LOTE ? null : unicas;
}

/** Andar a partir da identificação: "142" → 1, "1204" → 12. Sem número, null. */
export function andarDaUnidade(identificacao: string): number | null {
  const m = identificacao.match(/^(\d{3,4})$/);
  if (!m) return null;
  return Math.floor(Number(m[1]) / 100);
}

/** "Restam 3 de 2 dormitórios, 1 de 3" — o que a IA pode dizer. Nunca preço. */
export function resumoDeDisponibilidade(
  plantas: Array<{ dormitorios: number; unidadesDisponiveis: number | null }>,
): string | null {
  const porDorm = new Map<number, number>();
  let algumaConhecida = false;
  for (const p of plantas) {
    if (p.unidadesDisponiveis === null) continue;
    algumaConhecida = true;
    porDorm.set(p.dormitorios, (porDorm.get(p.dormitorios) ?? 0) + p.unidadesDisponiveis);
  }
  if (!algumaConhecida) return null;
  const partes = [...porDorm.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dorm, n]) =>
      n === 0 ? `${dorm} dorm: esgotado` : `${dorm} dorm: ${n} ${n === 1 ? "unidade" : "unidades"}`,
    );
  return partes.join("; ");
}

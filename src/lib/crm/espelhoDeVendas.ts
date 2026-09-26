/**
 * Espelho de vendas para parceiros (26/09/2026): por imóvel, quantas
 * unidades estão disponíveis, reservadas e vendidas, e quais estão livres.
 * Puro, para ser testado sem banco.
 */
export type UnidadeDoEspelho = {
  identificacao: string;
  status: "disponivel" | "reservada" | "vendida";
  dormitorios: number | null;
  area_m2: number | string | null;
  andar: number | null;
};

export function resumoDoEspelho(unidades: UnidadeDoEspelho[]) {
  const disponiveis = unidades
    .filter((u) => u.status === "disponivel")
    .sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true }));
  return {
    total: unidades.length,
    disponiveis,
    reservadas: unidades.filter((u) => u.status === "reservada").length,
    vendidas: unidades.filter((u) => u.status === "vendida").length,
  };
}

/** Teto de indicações por parceiro por hora: link vazado não vira fábrica de lead. */
export const TETO_INDICACOES_POR_HORA = 20;

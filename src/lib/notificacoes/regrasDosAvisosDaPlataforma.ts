/**
 * As regras PURAS dos avisos da plataforma (29/10/2026), para testar sem
 * banco: o que entra no resumo diário das mensalidades.
 */

import type { EstadoDaCobranca } from "@/lib/planos/cobranca";
import { nomeDoRamo, type Ramo } from "@/lib/ramos/ramos";

export type CobrancaParaAviso = {
  nome: string;
  estado: EstadoDaCobranca;
  diasDeAtraso: number;
  /** Tem competência vencida e não paga (distingue suspensão por atraso da manual). */
  temEmAberto: boolean;
};

/**
 * Pendente (venceu e não pagou) e suspensa POR ATRASO entram; em dia, isenta
 * e suspensa à mão sem débito ficam de fora (a manual já avisou na hora).
 * Até três nomes no corpo, o resto vira "e mais N".
 */
export function resumoDasCobrancas(lista: CobrancaParaAviso[]): { titulo: string; corpo: string } | null {
  const atrasadas = lista
    .filter((c) => c.temEmAberto && (c.estado === "pendente" || c.estado === "suspenso"))
    .sort((a, b) => b.diasDeAtraso - a.diasDeAtraso);
  if (!atrasadas.length) return null;
  const itens = atrasadas
    .slice(0, 3)
    .map((c) =>
      c.estado === "suspenso"
        ? `${c.nome} (suspensa, ${c.diasDeAtraso} dias)`
        : `${c.nome} (${c.diasDeAtraso === 0 ? "vence hoje" : `${c.diasDeAtraso} ${c.diasDeAtraso === 1 ? "dia" : "dias"}`})`,
    );
  const resto = atrasadas.length - itens.length;
  const n = atrasadas.length;
  return {
    titulo: n === 1 ? "1 mensalidade em aberto" : `${n} mensalidades em aberto`,
    corpo: itens.join(", ") + (resto > 0 ? ` e mais ${resto}` : "") + ".",
  };
}

/**
 * O rótulo da conta no aviso: pelo RAMO (0244) quando ele não é imobiliária
 * ("Clínica, empresa"), senão o de sempre ("imobiliária", "corretor
 * independente").
 */
export function rotuloDaContaNova(tipo: string, ramo?: Ramo | null, ramoDescricao?: string | null): string {
  if (ramo && ramo !== "imobiliaria") {
    return `${nomeDoRamo(ramo, ramoDescricao)}, ${tipo === "independente" ? "profissional independente" : "empresa"}`;
  }
  return tipo === "independente" ? "corretor independente" : "imobiliária";
}

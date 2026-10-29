// As regras do acesso à visão de suporte (0243, 29/10/2026).
//
// Módulo PURO: a action que registra o acesso, a página que o confere e os
// testes usam as mesmas regras.

/** O motivo que já vem escrito: abrir é um clique. */
export const MOTIVO_PADRAO = "Atendimento de suporte";

/** O mesmo teto do CHECK de `acessos_de_suporte.motivo` (0243). */
export const MOTIVO_MAXIMO = 200;

/**
 * Quanto tempo um acesso registrado libera a tela. Passou disso, a tela pede
 * um registro novo: o link com `?acesso=` copiado ou guardado no histórico
 * não reabre a conta dias depois sem deixar rastro.
 */
export const VALIDADE_DO_ACESSO_MS = 2 * 3_600_000;

export function acessoAindaVale(criadoEm: string, agora: Date): boolean {
  const idade = agora.getTime() - new Date(criadoEm).getTime();
  return Number.isFinite(idade) && idade >= -60_000 && idade <= VALIDADE_DO_ACESSO_MS;
}

/** O motivo digitado: espaços aparados, vazio vira o padrão; `null` = longo demais. */
export function normalizarMotivo(valor: unknown): string | null {
  const texto = typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
  if (texto.length === 0) return MOTIVO_PADRAO;
  return texto.length > MOTIVO_MAXIMO ? null : texto;
}

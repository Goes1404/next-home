import type { TemperaturaLeadLabel } from "./types";

/**
 * O dossiê se apagava sozinho, e a causa é a mesma que já mordeu `leads`.
 *
 * `salvarDossie` faz `upsert` com TODAS as colunas, e a extração enxerga só a
 * janela do histórico. Quando o assunto sai da janela, o campo volta `null` —
 * e o upsert grava esse `null` por cima do que o cliente já tinha dito. Em
 * 24/08 `leads` ganhou a guarda contra isso (renda e orçamento);
 * `lead_observacoes_ia` nunca ganhou. Estado medido: 16 dossiês para 131
 * leads, com orçamento 0/16 e forma de pagamento 0/16.
 *
 * A regra é: **`null` não apaga.** O que o cliente disse não se desdiz porque
 * ele parou de repetir.
 *
 * Módulo PURO de propósito. É regra de negócio, não detalhe de persistência —
 * e é isso que a torna testável sem banco. A leitura da linha anterior
 * acontece DENTRO de `salvarDossie`, não no chamador: o webhook tem um
 * `dossieAnterior` em mãos, mas passá-lo faria a guarda depender de o chamador
 * lembrar, e é justamente o esquecimento de um chamador que este projeto já
 * pagou caro (foi o que tirou `interacaoId` dos parâmetros de
 * `gravarMensagem`).
 */
export type LinhaDossie = {
  orcamento_min: number | null;
  orcamento_max: number | null;
  forma_pagamento: string | null;
  perfil_familiar: string | null;
  urgencia_mudanca: string | null;
  exigencias_especificas: string[];
  objecoes_identificadas: string[];
  temperatura_score: number;
  temperatura_label: TemperaturaLeadLabel;
  resumo_executivo: string;
  proximo_passo_sugerido: string | null;
};

/** Campos que acumulam: o que foi dito uma vez continua valendo. */
const FATOS = [
  "orcamento_min",
  "orcamento_max",
  "forma_pagamento",
  "perfil_familiar",
  "urgencia_mudanca",
  "proximo_passo_sugerido",
] as const;

/** Campos de lista: vazia não apaga, cheia substitui (nunca une). */
const LISTAS = ["exigencias_especificas", "objecoes_identificadas"] as const;

export function mesclarDossie(anterior: LinhaDossie | null, novo: LinhaDossie): LinhaDossie {
  // Primeira gravação: não há o que preservar, e escrever tudo é o certo.
  if (!anterior) return novo;

  const final: LinhaDossie = { ...novo };

  for (const campo of FATOS) {
    // `null` é "a extração não achou nesta janela", nunca "o cliente desdisse".
    if (final[campo] === null) {
      (final[campo] as LinhaDossie[typeof campo]) = anterior[campo];
    }
  }

  for (const campo of LISTAS) {
    /*
     * Vazia não apaga; NÃO-vazia substitui, nunca faz união. Acumular
     * guardaria objeção já superada, e objeção morta no dossiê manda a IA
     * tratar um problema que o cliente já esqueceu — o que, do lado dele,
     * soa como não ter sido ouvido.
     */
    if (final[campo].length === 0) final[campo] = anterior[campo];
  }

  /*
   * O que NÃO se preserva, e é decisão:
   *
   * `temperatura_score`, `temperatura_label` e `resumo_executivo` são leitura
   * DO MOMENTO, não fato acumulado. Preservar o score antigo faria o
   * termostato do `evolucaoConversa` comparar com um número que já não
   * existe — e é a comparação de faixa que decide se o corretor recebe aviso.
   * Um lead que esfriou tem de aparecer esfriando.
   */
  return final;
}

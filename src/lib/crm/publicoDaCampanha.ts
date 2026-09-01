import type { Lead } from "@/lib/types";

/**
 * Quem entra numa campanha, por público escolhido.
 *
 * ## Por que mora aqui, e não na action
 *
 * `campanhas/acoes.ts` é `"use server"`: todo export precisa ser função
 * async, então uma regra pura exportada de lá QUEBRA O BUILD. Foi o que
 * aconteceu ao tentar testar `elegivel` no lugar antigo — e é a razão pela
 * qual a casa mantém a régua em módulo próprio: aqui ela é importável,
 * testável e não arrasta o grafo do servidor.
 */

export type FiltroLeadsCampanha =
  | "parados_15d"
  | "novos_sem_contato"
  | "sem_resposta"
  | "todos"
  | "selecionados";

const DIAS_PARADO = 15;

/**
 * A partir de quantas tentativas sem resposta a insistência para.
 *
 * `tentativas_sem_resposta` (0060) conta quantas vezes NÓS falamos desde a
 * última fala do cliente, e zera quando ele responde. Três seguidas sem
 * retorno é onde a ficha do lead já sugere parar: a quarta não converte e
 * alimenta denúncia, que é o sinal mais forte que existe contra o número —
 * a mesma razão de existir a janela comercial.
 *
 * O teto é do FILTRO, não do sistema: quem quiser insistir mais escolhe o
 * lead a dedo em "Escolher um por um". Automático é que não empurra.
 *
 * Medido na base em 01/09: **26 leads** entram no filtro e **15** ficam de
 * fora por já terem passado do teto — quinze que uma campanha "todos"
 * teria queimado com a quarta mensagem.
 */
export const TETO_DE_INSISTENCIA = 3;

/** Fechado e perdido nunca entram — reativar quem já comprou ou já disse não é o oposto do objetivo. */
export function elegivel(lead: Lead, filtro: FiltroLeadsCampanha): boolean {
  if (!lead.telefone) return false;
  if (lead.etapa === "fechado" || lead.etapa === "perdido") return false;

  if (filtro === "novos_sem_contato") return lead.etapa === "novo";

  if (filtro === "parados_15d") {
    const dias = (Date.now() - new Date(lead.etapaAlteradaEm).getTime()) / 86_400_000;
    return dias >= DIAS_PARADO;
  }

  /*
   * Abordado e calado — o público que não existia e é o maior da base.
   * Medido em 01/09: 46 dos 112 leads ativos estão em "primeiro contato",
   * receberam disparo e nunca responderam. `novos_sem_contato` não os
   * alcança (não são "novo"), `parados_15d` também não (a etapa mudou há 5
   * dias) e `todos` incluiria quem JÁ respondeu — mensagem repetida cansa
   * justamente quem está conversando.
   */
  if (filtro === "sem_resposta") {
    return lead.tentativasSemResposta >= 1 && lead.tentativasSemResposta < TETO_DE_INSISTENCIA;
  }

  // "todos" e "selecionados" usam só as regras de base: quem recorta a
  // seleção manual é a lista de ids, na action.
  return true;
}

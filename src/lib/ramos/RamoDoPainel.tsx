"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ETAPA_LABEL, GRUPO_LABEL, type EtapaFunil, type GrupoFunil } from "@/lib/types";
import { RAMO_PADRAO, acoesDeEtapaDoRamo, rotuloDoGrupoVisita, rotulosDeEtapaDoRamo, vocabularioDoRamo, type Ramo, type Vocabulario } from "./ramos";

/**
 * O ramo da conta para os componentes de cliente do painel (29/10/2026).
 *
 * O layout do painel lê o ramo do grupo (`getCorretorLogado().ramo`) e o
 * entrega aqui; quem está dentro pede `useVocabulario()` ou
 * `useRotuloDaEtapa()`. FORA do provedor vale a imobiliária: componente que
 * ainda não foi ligado ao ramo continua com o texto de sempre, nunca com um
 * vazio.
 */
type RamoDoPainel = { ramo: Ramo; descricao: string | null };

const Contexto = createContext<RamoDoPainel>({ ramo: RAMO_PADRAO, descricao: null });

export function RamoDoPainelProvider({
  ramo,
  descricao,
  children,
}: {
  ramo: Ramo;
  descricao: string | null;
  children: ReactNode;
}) {
  return <Contexto.Provider value={{ ramo, descricao }}>{children}</Contexto.Provider>;
}

export function useRamoDoPainel(): RamoDoPainel {
  return useContext(Contexto);
}

export function useVocabulario(): Vocabulario {
  return vocabularioDoRamo(useContext(Contexto).ramo);
}

/** O rótulo da etapa do funil no vocabulário do ramo ("Reunião marcada"). */
export function useRotuloDaEtapa(): (etapa: EtapaFunil) => string {
  const extras: Partial<Record<EtapaFunil, string>> = rotulosDeEtapaDoRamo(useContext(Contexto).ramo);
  return (etapa) => extras[etapa] ?? ETAPA_LABEL[etapa];
}

/** O rótulo da coluna do funil agrupado no vocabulário do ramo ("Reunião"). */
export function useRotuloDoGrupoDoFunil(): (grupo: GrupoFunil) => string {
  const visita = rotuloDoGrupoVisita(useContext(Contexto).ramo);
  return (grupo) => (grupo === "visita" && visita ? visita : GRUPO_LABEL[grupo]);
}

/**
 * O ato do botão de um toque (`PROXIMA_ETAPA[etapa].acao`) no vocabulário do
 * ramo ("Marquei reunião"). Recebe a etapa ATUAL do lead.
 */
export function useAcaoDaProximaEtapa(): (etapaAtual: EtapaFunil, acaoPadrao: string) => string {
  const extras: Partial<Record<EtapaFunil, string>> = acoesDeEtapaDoRamo(useContext(Contexto).ramo);
  return (etapaAtual, acaoPadrao) => extras[etapaAtual] ?? acaoPadrao;
}

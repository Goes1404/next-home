import { centavos } from "./venda";

/**
 * A previsão de caixa (F7 do financeiro): quanto deve entrar.
 *
 * Duas camadas, e a tela nunca soma uma na outra sem dizer:
 *  - CERTO: comissão de venda já registrada que ainda não foi paga. É
 *    dinheiro com contrato assinado; o risco é só o atraso (ou distrato).
 *  - ESTIMADO: leads em documentação × quantos deles historicamente viram
 *    venda × quanto uma venda rende. É projeção, e só aparece com amostra
 *    mínima de vendas — com duas vendas na história, "R$ 40 mil previstos"
 *    seria um número inventado com cara de relatório.
 */

export const VENDAS_MINIMAS_PARA_ESTIMAR = 5;

export type Previsao = {
  certo: number;
  estimado: number | null;
  /** Quando não há estimativa, o porquê em português de tela. */
  semEstimativa: string | null;
  leadsEmDocumentacao: number;
};

export function preverCaixa(params: {
  certo: number;
  leadsEmDocumentacao: number;
  /** Dos leads que chegaram a documentação, fração que virou venda. */
  docParaVenda: number | null;
  /** Quanto uma venda rende para quem está olhando (comissão ou repasse). */
  rendePorVenda: number | null;
  vendasNaHistoria: number;
}): Previsao {
  const base = { certo: centavos(params.certo), leadsEmDocumentacao: params.leadsEmDocumentacao };
  if (params.leadsEmDocumentacao === 0) {
    return { ...base, estimado: null, semEstimativa: "Nenhum lead em documentação agora." };
  }
  if (params.vendasNaHistoria < VENDAS_MINIMAS_PARA_ESTIMAR || params.docParaVenda === null || !params.rendePorVenda) {
    return {
      ...base,
      estimado: null,
      semEstimativa: `A estimativa aparece com ${VENDAS_MINIMAS_PARA_ESTIMAR} vendas registradas na equipe; antes disso ela seria palpite.`,
    };
  }
  return {
    ...base,
    estimado: centavos(params.leadsEmDocumentacao * params.docParaVenda * params.rendePorVenda),
    semEstimativa: null,
  };
}

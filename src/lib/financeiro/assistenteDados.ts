import "server-only";

import { getCaixa, getLancamentosPagos } from "./caixaDados";
import { getVendas } from "./dados";
import { getFiscal } from "./fiscalDados";
import { getMesesFechados } from "./contadorDados";
import { fluxoDeCaixa, movimentosDo, proximosPendentes } from "./caixa";
import { mesesAte, resultadoDoMes } from "./resultado";
import { impostosDoMes, ROTULO_REGIME, semNotaFiscal } from "./fiscal";
import { alertasDoFinanceiro, type Alerta } from "./alertas";
import type { DadosDoAssistente } from "./assistenteFinanceiro";
import { centavos } from "./venda";

/**
 * Junta o que os alertas e o assistente financeiro leem (07/10/2026), pelas
 * MESMAS leituras das telas Caixa, Resultado, Fiscal e Contador. Uma conta
 * paralela aqui divergiria das telas, e o dono ouviria do assistente um
 * número que a tela não mostra.
 */

export type LeituraDoFinanceiro =
  | { ok: true; alertas: Alerta[]; dados: DadosDoAssistente }
  | { ok: false; motivo: "sem_tabela" | "erro" };

export async function lerFinanceiroDoDono(hoje: string): Promise<LeituraDoFinanceiro> {
  const mesAtual = hoje.slice(0, 7);
  const meses = mesesAte(mesAtual, 6);
  const desde = `${meses[0]}-01`;

  const [caixa, pagos, leituraVendas, fechados] = await Promise.all([
    getCaixa(hoje),
    getLancamentosPagos(desde, hoje),
    getVendas(),
    getMesesFechados(),
  ]);
  if (!caixa.ok) return caixa;
  if (!pagos.ok) return pagos;
  const vendas = leituraVendas.ok ? leituraVendas.vendas : [];

  const fiscal = await getFiscal(vendas.map((v) => v.id));
  const movimentos = movimentosDo(caixa.lancamentos, vendas);
  const fluxo = fluxoDeCaixa({ movimentos, saldo: caixa.saldo, hoje });

  const movimentosPagos = movimentosDo(pagos.lancamentos, vendas);
  const resultados = meses.map((m) => resultadoDoMes(movimentosPagos, m));
  const doMes = resultados[resultados.length - 1];

  const vendasFiscais = vendas.map((v) => ({
    id: v.id,
    imovel: v.imovel,
    unidade: v.unidade,
    construtora: v.construtora,
    leadNome: v.leadNome,
    dataVenda: v.dataVenda,
    valorVenda: v.valorVenda,
    comissaoValor: v.comissaoValor,
    status: v.status,
    comissaoRecebidaEm: v.comissaoRecebidaEm,
  }));
  const semNota = fiscal.ok ? semNotaFiscal(vendasFiscais, fiscal.dados) : [];
  const mesesFechados = fechados.ok ? fechados.meses.map((m) => m.mes) : [];

  const atrasados = movimentos.filter((m) => !m.pagoEm && m.vencimento !== null && m.vencimento < hoje);
  const semData = movimentos.filter((m) => !m.pagoEm && m.vencimento === null);

  const alertas = alertasDoFinanceiro({
    hoje,
    movimentos,
    fluxo,
    // Só os meses que terminaram: o corrente ainda está correndo.
    resultados: resultados.slice(0, -1).slice(-4),
    mesesFechados,
    semNota: { quantidade: semNota.length, valor: centavos(semNota.reduce((s, v) => s + v.comissaoValor, 0)) },
    fiscalConferido: fiscal.ok ? fiscal.config.conferidoEm !== null : true,
  });

  return {
    ok: true,
    alertas,
    dados: {
      hoje,
      fluxo,
      alertas,
      resultados,
      proximos: [...atrasados, ...proximosPendentes(movimentos, hoje, 30), ...semData],
      impostosDoMes: fiscal.ok ? impostosDoMes(doMes.receitaCorretagem, fiscal.config) : [],
      regime: fiscal.ok ? ROTULO_REGIME[fiscal.config.regime] : "regime não configurado",
      mesesFechados,
    },
  };
}

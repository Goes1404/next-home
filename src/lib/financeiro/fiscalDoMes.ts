import "server-only";

import { getVendas, type VendaNaTela } from "./dados";
import { getAvulsasDoMes, getLancamentosPagos } from "./caixaDados";
import { movimentosDo, somarDias, somarMeses, type Movimento } from "./caixa";
import { resultadoDoMes, type ResultadoDoMes } from "./resultado";
import { getFiscal } from "./fiscalDados";
import {
  calcularRpa,
  impostosDoMes,
  semNotaFiscal,
  vendasDoAno,
  type ConfigFiscal,
  type DadosFiscaisDaVenda,
  type LinhaDeImposto,
  type VendaParaFiscal,
} from "./fiscal";
import type { LinhaDeRpa } from "./fiscalPlanilhas";
import { parametrosNaData, type ParametrosFiscais } from "./parametrosFiscais";
import { receitaBaseDoMes, type ReceitaBase } from "./receitaBase";

/**
 * Tudo o que a tela Fiscal e as planilhas do contador precisam de um mês,
 * montado num lugar só: tela e planilha não podem contar diferente.
 */

export type FiscalDoMes = {
  mes: string;
  ano: string;
  config: ConfigFiscal;
  /** A base do imposto estimado, pelo regime de apuração da config (0232). */
  receita: number;
  receitaBase: ReceitaBase;
  /** Parâmetros nacionais vigentes no fim do mês, com a fonte de cada um. */
  parametros: ParametrosFiscais;
  impostos: LinhaDeImposto[];
  impostosPagos: number;
  rpas: LinhaDeRpa[];
  /** Repasses do mês a corretores marcados como PJ (sem RPA, pedem nota). */
  repassesPj: { corretor: string; imovel: string; pagoEm: string; valor: number }[];
  semNota: VendaParaFiscal[];
  /** Vendas com alguma parcela da comissão recebida neste mês. */
  comissoesDoMes: VendaParaFiscal[];
  doAno: VendaParaFiscal[];
  dados: Map<string, DadosFiscaisDaVenda>;
  vinculos: Map<string, "autonomo" | "pj">;
  corretores: { id: string; nome: string }[];
  vendasLidas: boolean;
  /** Para o pacote do contador: o que foi pago e recebido no mês e a DRE. */
  movimentosDoMes: Movimento[];
  resultado: ResultadoDoMes;
};

export type LeituraFiscalDoMes = { ok: true; fiscal: FiscalDoMes } | { ok: false; motivo: "sem_tabela" | "erro" };

const paraFiscal = (v: VendaNaTela): VendaParaFiscal => ({
  id: v.id,
  imovel: v.imovel,
  unidade: v.unidade,
  construtora: v.construtora,
  leadNome: v.leadNome,
  dataVenda: v.dataVenda,
  valorVenda: v.valorVenda,
  comissaoValor: v.comissaoValor,
  status: v.status,
  parcelas: v.parcelas,
});

export async function getFiscalDoMes(mes: string): Promise<LeituraFiscalDoMes> {
  const ano = mes.slice(0, 4);
  const desde = `${mes}-01`;
  const ate = `${somarMeses(desde, 1).slice(0, 7)}-01`;

  const [leituraVendas, pagos, avulsas] = await Promise.all([getVendas(), getLancamentosPagos(desde, ate), getAvulsasDoMes(mes)]);
  const vendas = leituraVendas.ok ? leituraVendas.vendas : [];
  const leitura = await getFiscal(vendas.map((v) => v.id));
  if (!leitura.ok) return leitura;
  const { config, dados, vinculos } = leitura;
  const fimDoMes = somarDias(ate, -1);

  const movimentos = movimentosDo(pagos.ok ? pagos.lancamentos.filter((l) => l.pagoEm !== null && l.pagoEm < ate) : [], vendas);
  const doMes = resultadoDoMes(movimentos, mes);
  const receitaBase = receitaBaseDoMes(vendas, avulsas, mes, config.regimeApuracao);
  const receita = receitaBase.total;

  // Repasses pagos no mês, em ordem, para o RPA descontar o que já foi retido.
  // Venda distratada entra: o repasse que foi pago, foi pago. Quem recebe
  // direto do pagador não recebe da imobiliária, então não tem RPA dela.
  const repasses = vendas
    .flatMap((v) =>
      v.participantes
        .filter((p) => p.repassePagoEm?.startsWith(mes) && p.repasseValor > 0 && p.formaRecebimento !== "direto")
        .map((p) => ({ corretorId: p.corretorId, corretor: p.nome, imovel: [v.imovel, v.unidade].filter(Boolean).join(" · "), pagoEm: p.repassePagoEm as string, valor: p.repasseValor })),
    )
    .sort((a, b) => a.pagoEm.localeCompare(b.pagoEm));

  const jaPago = new Map<string, number>();
  const rpas: LinhaDeRpa[] = [];
  const repassesPj: FiscalDoMes["repassesPj"] = [];
  for (const r of repasses) {
    if (vinculos.get(r.corretorId) === "pj") {
      repassesPj.push({ corretor: r.corretor, imovel: r.imovel, pagoEm: r.pagoEm, valor: r.valor });
      continue;
    }
    const antes = jaPago.get(r.corretorId) ?? 0;
    rpas.push({ corretor: r.corretor, imovel: r.imovel, pagoEm: r.pagoEm, rpa: calcularRpa(r.valor, config, parametrosNaData(leitura.parametros, r.pagoEm), antes) });
    jaPago.set(r.corretorId, antes + r.valor);
  }

  const corretores = new Map<string, string>();
  for (const v of vendas) for (const p of v.participantes) corretores.set(p.corretorId, p.nome);

  const fiscais = vendas.map(paraFiscal);
  return {
    ok: true,
    fiscal: {
      mes,
      ano,
      config,
      receita,
      receitaBase,
      parametros: parametrosNaData(leitura.parametros, fimDoMes),
      impostos: impostosDoMes(receita, config),
      impostosPagos: doMes.impostos,
      rpas,
      repassesPj,
      semNota: semNotaFiscal(fiscais, dados),
      comissoesDoMes: fiscais.filter((v) => v.parcelas.some((p) => p.recebidaEm?.startsWith(mes))),
      doAno: vendasDoAno(fiscais, ano),
      dados,
      vinculos,
      corretores: [...corretores.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      vendasLidas: leituraVendas.ok,
      movimentosDoMes: movimentos.filter((m) => m.pagoEm?.startsWith(mes)),
      resultado: doMes,
    },
  };
}

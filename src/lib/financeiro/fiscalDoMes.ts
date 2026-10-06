import "server-only";

import { getVendas, type VendaNaTela } from "./dados";
import { getLancamentosPagos } from "./caixaDados";
import { movimentosDo, somarMeses } from "./caixa";
import { resultadoDoMes } from "./resultado";
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

/**
 * Tudo o que a tela Fiscal e as planilhas do contador precisam de um mês,
 * montado num lugar só: tela e planilha não podem contar diferente.
 */

export type FiscalDoMes = {
  mes: string;
  ano: string;
  config: ConfigFiscal;
  receita: number;
  impostos: LinhaDeImposto[];
  impostosPagos: number;
  rpas: LinhaDeRpa[];
  /** Repasses do mês a corretores marcados como PJ (sem RPA, pedem nota). */
  repassesPj: { corretor: string; imovel: string; pagoEm: string; valor: number }[];
  semNota: VendaParaFiscal[];
  doAno: VendaParaFiscal[];
  dados: Map<string, DadosFiscaisDaVenda>;
  vinculos: Map<string, "autonomo" | "pj">;
  corretores: { id: string; nome: string }[];
  vendasLidas: boolean;
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
  comissaoRecebidaEm: v.comissaoRecebidaEm,
});

export async function getFiscalDoMes(mes: string): Promise<LeituraFiscalDoMes> {
  const ano = mes.slice(0, 4);
  const desde = `${mes}-01`;
  const ate = `${somarMeses(desde, 1).slice(0, 7)}-01`;

  const [leituraVendas, pagos] = await Promise.all([getVendas(), getLancamentosPagos(desde, ate)]);
  const vendas = leituraVendas.ok ? leituraVendas.vendas : [];
  const leitura = await getFiscal(vendas.map((v) => v.id));
  if (!leitura.ok) return leitura;
  const { config, dados, vinculos } = leitura;

  const movimentos = movimentosDo(pagos.ok ? pagos.lancamentos.filter((l) => l.pagoEm !== null && l.pagoEm < ate) : [], vendas);
  const doMes = resultadoDoMes(movimentos, mes);
  const receita = doMes.receitaCorretagem;

  // Repasses pagos no mês, em ordem, para o RPA descontar o que já foi retido.
  const repasses = vendas
    .filter((v) => v.status === "ativa")
    .flatMap((v) =>
      v.participantes
        .filter((p) => p.repassePagoEm?.startsWith(mes) && p.repasseValor > 0)
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
    rpas.push({ corretor: r.corretor, imovel: r.imovel, pagoEm: r.pagoEm, rpa: calcularRpa(r.valor, config, antes) });
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
      impostos: impostosDoMes(receita, config),
      impostosPagos: doMes.impostos,
      rpas,
      repassesPj,
      semNota: semNotaFiscal(fiscais, dados),
      doAno: vendasDoAno(fiscais, ano),
      dados,
      vinculos,
      corretores: [...corretores.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome)),
      vendasLidas: leituraVendas.ok,
    },
  };
}

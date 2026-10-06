import type { Planilha } from "@/lib/imoveis/xlsxEscrita";
import {
  ROTULO_REGIME,
  faltasDaDimob,
  formatarDocumento,
  type ConfigFiscal,
  type DadosFiscaisDaVenda,
  type LinhaDeImposto,
  type Rpa,
  type VendaParaFiscal,
} from "./fiscal";

/**
 * As planilhas que o contador recebe (0167). Módulo puro: monta linhas, quem
 * escreve o .xlsx é `gerarXlsx`. Valores saem como número (o Excel soma) e
 * datas como texto aaaa-mm-dd (ordena certo e não vira data americana).
 */

const pct = (n: number) => Math.round(n * 10000) / 100;

export function planilhaDeImpostos(mes: string, receita: number, linhas: LinhaDeImposto[], config: ConfigFiscal, pagosNoCaixa: number): Planilha {
  return {
    aba: `Impostos ${mes}`,
    colunas: [
      { titulo: "Imposto", largura: 26 },
      { titulo: "Base (R$)", largura: 14 },
      { titulo: "Alíquota (%)", largura: 12 },
      { titulo: "Valor estimado (R$)", largura: 18 },
      { titulo: "Observação", largura: 70, quebra: true },
    ],
    linhas: [
      ...linhas.map((l) => [l.nome, l.base, pct(l.aliquota), l.valor, l.explicacao]),
      ["Total estimado", receita, null, linhas.reduce((s, l) => s + l.valor, 0), `Regime: ${ROTULO_REGIME[config.regime]}`],
      ["Pago no Caixa (categoria impostos)", null, null, pagosNoCaixa, "O que foi lançado como imposto pago no mês."],
    ],
  };
}

export type LinhaDeRpa = { corretor: string; imovel: string; pagoEm: string; rpa: Rpa };

export function planilhaDeRpa(mes: string, linhas: LinhaDeRpa[]): Planilha {
  return {
    aba: `RPA ${mes}`,
    colunas: [
      { titulo: "Corretor", largura: 28 },
      { titulo: "Venda", largura: 32 },
      { titulo: "Pago em", largura: 12 },
      { titulo: "Bruto (R$)", largura: 14 },
      { titulo: "INSS retido (R$)", largura: 16 },
      { titulo: "IRRF retido (R$)", largura: 16 },
      { titulo: "Líquido (R$)", largura: 14 },
      { titulo: "INSS patronal (R$)", largura: 18 },
    ],
    linhas: linhas.map((l) => [l.corretor, l.imovel, l.pagoEm, l.rpa.bruto, l.rpa.inss, l.rpa.irrf, l.rpa.liquido, l.rpa.inssPatronal]),
  };
}

export function planilhaDeNotas(vendas: VendaParaFiscal[], fiscal: Map<string, DadosFiscaisDaVenda>): Planilha {
  return {
    aba: "Notas fiscais",
    colunas: [
      { titulo: "Venda", largura: 32 },
      { titulo: "Tomador (construtora)", largura: 28 },
      { titulo: "CNPJ do tomador", largura: 20 },
      { titulo: "Comissão (R$)", largura: 14 },
      { titulo: "Comissão recebida em", largura: 18 },
      { titulo: "Nº da NFS-e", largura: 14 },
      { titulo: "Emitida em", largura: 12 },
    ],
    linhas: vendas.map((v) => {
      const f = fiscal.get(v.id);
      return [
        [v.imovel, v.unidade].filter(Boolean).join(" · "),
        f?.vendedorNome ?? v.construtora ?? "",
        formatarDocumento(f?.vendedorDocumento ?? null),
        v.comissaoValor,
        v.comissaoRecebidaEm ?? "",
        f?.notaNumero ?? "",
        f?.notaEmitidaEm ?? "",
      ];
    }),
  };
}

export function planilhaDaDimob(ano: string, vendas: VendaParaFiscal[], fiscal: Map<string, DadosFiscaisDaVenda>, config: ConfigFiscal): Planilha {
  return {
    aba: `DIMOB ${ano}`,
    colunas: [
      { titulo: "Data da venda", largura: 12 },
      { titulo: "Imóvel", largura: 32 },
      { titulo: "Unidade", largura: 12 },
      { titulo: "Comprador", largura: 28 },
      { titulo: "CPF/CNPJ do comprador", largura: 20 },
      { titulo: "Vendedor", largura: 28 },
      { titulo: "CPF/CNPJ do vendedor", largura: 20 },
      { titulo: "Valor da operação (R$)", largura: 18 },
      { titulo: "Comissão (R$)", largura: 14 },
      { titulo: "Falta", largura: 40, quebra: true },
    ],
    linhas: [
      ...vendas.map((v) => {
        const f = fiscal.get(v.id);
        return [
          v.dataVenda,
          v.imovel,
          v.unidade ?? "",
          f?.compradorNome ?? v.leadNome ?? "",
          formatarDocumento(f?.compradorDocumento ?? null),
          f?.vendedorNome ?? v.construtora ?? "",
          formatarDocumento(f?.vendedorDocumento ?? null),
          v.valorVenda,
          v.comissaoValor,
          faltasDaDimob(v, f).join(", "),
        ];
      }),
      [null, `Imobiliária: ${config.razaoSocial ?? ""}`, null, null, formatarDocumento(config.cnpj), null, null, null, null, null],
    ],
  };
}

import { centavos } from "./venda";

/**
 * O fiscal da imobiliária (0167). Módulo puro: impostos estimados do mês,
 * retenções do RPA do corretor autônomo, CPF/CNPJ e as linhas da DIMOB.
 *
 * Tudo aqui é ESTIMATIVA para o dono não ser pego de surpresa e para o
 * contador receber a planilha pronta. Quem apura e assina é o contador: as
 * alíquotas mudam por lei e por faixa, e por isso moram em `fiscal_config`,
 * que o dono confere.
 */

export type Regime = "simples" | "presumido";

export type ConfigFiscal = {
  regime: Regime;
  /** Alíquota EFETIVA do DAS no Simples (fração: 0.06 = 6%). */
  aliquotaSimples: number;
  /** ISS do município no lucro presumido (no Simples ele está dentro do DAS). */
  aliquotaIss: number;
  /** Teto de contribuição do INSS do mês. */
  tetoInss: number;
  cnpj: string | null;
  razaoSocial: string | null;
  conferidoEm: string | null;
};

export const CONFIG_PADRAO: ConfigFiscal = {
  regime: "simples",
  aliquotaSimples: 0.06,
  aliquotaIss: 0.02,
  tetoInss: 8157.41,
  cnpj: null,
  razaoSocial: null,
  conferidoEm: null,
};

export const ROTULO_REGIME: Record<Regime, string> = {
  simples: "Simples Nacional",
  presumido: "Lucro presumido",
};

// ── Impostos do mês ──────────────────────────────────────────────────────

export type LinhaDeImposto = {
  nome: string;
  base: number;
  /** Alíquota efetiva sobre a base (fração). */
  aliquota: number;
  valor: number;
  explicacao: string;
};

/** Presunção de lucro de serviço (corretagem) no lucro presumido. */
export const PRESUNCAO_SERVICO = 0.32;
/** Base mensal acima da qual o IRPJ tem o adicional de 10%. */
export const LIMITE_ADICIONAL_IRPJ = 20000;

/**
 * Impostos estimados sobre a receita de serviço do mês (regime de caixa,
 * a mesma receita do Resultado do mês).
 */
export function impostosDoMes(receita: number, config: ConfigFiscal): LinhaDeImposto[] {
  if (receita <= 0) return [];
  if (config.regime === "simples") {
    return [
      {
        nome: "DAS (Simples Nacional)",
        base: centavos(receita),
        aliquota: config.aliquotaSimples,
        valor: centavos(receita * config.aliquotaSimples),
        explicacao: "Alíquota efetiva informada na configuração. Já inclui ISS, PIS, COFINS, IRPJ, CSLL e INSS patronal.",
      },
    ];
  }
  const presumido = receita * PRESUNCAO_SERVICO;
  const adicional = Math.max(0, presumido - LIMITE_ADICIONAL_IRPJ) * 0.1;
  const linha = (nome: string, aliquota: number, explicacao: string, extra = 0): LinhaDeImposto => ({
    nome,
    base: centavos(receita),
    aliquota: (receita * aliquota + extra) / receita,
    valor: centavos(receita * aliquota + extra),
    explicacao,
  });
  return [
    linha("ISS", config.aliquotaIss, "Imposto do município sobre o serviço de corretagem."),
    linha("PIS", 0.0065, "Regime cumulativo: 0,65% da receita."),
    linha("COFINS", 0.03, "Regime cumulativo: 3% da receita."),
    linha(
      "IRPJ",
      PRESUNCAO_SERVICO * 0.15,
      "15% sobre 32% da receita, mais 10% sobre a parte da base que passar de R$ 20 mil no mês. Apurado por trimestre.",
      adicional,
    ),
    linha("CSLL", PRESUNCAO_SERVICO * 0.09, "9% sobre 32% da receita. Apurada por trimestre."),
  ];
}

export function totalDeImpostos(linhas: LinhaDeImposto[]): number {
  return centavos(linhas.reduce((s, l) => s + l.valor, 0));
}

// ── RPA do corretor autônomo ─────────────────────────────────────────────

/** Tabela progressiva mensal do IRRF (vigente desde maio de 2025). */
const FAIXAS_IRRF: { ate: number; aliquota: number; deducao: number }[] = [
  { ate: 2428.8, aliquota: 0, deducao: 0 },
  { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
  { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
  { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
  { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
];

/** Desconto simplificado mensal: substitui as deduções legais quando é maior. */
export const DESCONTO_SIMPLIFICADO = 607.2;

/**
 * Redução do IRRF de 2026 (Lei 15.270/2025): zera o imposto de quem recebe
 * até R$ 5 mil no mês e diminui aos poucos até R$ 7.350.
 */
export function reducaoDoIrrf(rendimento: number, imposto: number): number {
  if (rendimento <= 5000) return imposto;
  if (rendimento <= 7350) return Math.min(imposto, Math.max(0, 978.62 - 0.133145 * rendimento));
  return 0;
}

export function irrfDaTabela(base: number): number {
  if (base <= 0) return 0;
  const faixa = FAIXAS_IRRF.find((f) => base <= f.ate) ?? FAIXAS_IRRF[FAIXAS_IRRF.length - 1];
  return Math.max(0, base * faixa.aliquota - faixa.deducao);
}

export type Rpa = {
  bruto: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  liquido: number;
  /** 20% de INSS patronal: só fora do Simples. */
  inssPatronal: number;
  custoTotal: number;
};

/**
 * Retenções do recibo de pagamento de autônomo. `brutoNoMes` é tudo o que o
 * corretor já recebeu da imobiliária por RPA no mesmo mês: o INSS tem teto e
 * o IRRF é mensal, então dois repasses no mês não podem ser calculados como
 * se fossem um só cada. A função devolve o RPA do valor `bruto` descontando o
 * que já foi retido sobre `jaPagoNoMes`.
 */
export function calcularRpa(bruto: number, config: ConfigFiscal, jaPagoNoMes = 0): Rpa {
  const total = (v: number) => {
    const inss = Math.min(v, config.tetoInss) * 0.11;
    const base = Math.max(0, v - Math.max(inss, DESCONTO_SIMPLIFICADO));
    const irBruto = irrfDaTabela(base);
    const irrf = Math.max(0, irBruto - reducaoDoIrrf(v, irBruto));
    return { inss, base, irrf };
  };
  const antes = total(jaPagoNoMes);
  const depois = total(jaPagoNoMes + bruto);
  const inss = centavos(depois.inss - antes.inss);
  const irrf = centavos(depois.irrf - antes.irrf);
  const inssPatronal = config.regime === "presumido" ? centavos(bruto * 0.2) : 0;
  return {
    bruto: centavos(bruto),
    inss,
    baseIrrf: centavos(depois.base),
    irrf,
    liquido: centavos(bruto - inss - irrf),
    inssPatronal,
    custoTotal: centavos(bruto + inssPatronal),
  };
}

// ── CPF e CNPJ ───────────────────────────────────────────────────────────

export const soDigitos = (v: string) => v.replace(/\D/g, "");

function digitoCpf(d: string, n: number): number {
  let soma = 0;
  for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
  const r = (soma * 10) % 11;
  return r === 10 ? 0 : r;
}

function digitoCnpj(d: string, n: number): number {
  const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((s, p, i) => s + Number(d[i]) * p, 0);
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}

/** CPF (11) ou CNPJ (14) com dígitos verificadores certos. */
export function documentoValido(v: string): boolean {
  const d = soDigitos(v);
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) return digitoCpf(d, 9) === Number(d[9]) && digitoCpf(d, 10) === Number(d[10]);
  if (d.length === 14) return digitoCnpj(d, 12) === Number(d[12]) && digitoCnpj(d, 13) === Number(d[13]);
  return false;
}

export function formatarDocumento(v: string | null): string {
  if (!v) return "";
  const d = soDigitos(v);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return v;
}

// ── Vendas: nota fiscal e DIMOB ──────────────────────────────────────────

export type DadosFiscaisDaVenda = {
  vendaId: string;
  compradorNome: string | null;
  compradorDocumento: string | null;
  vendedorNome: string | null;
  vendedorDocumento: string | null;
  notaNumero: string | null;
  notaEmitidaEm: string | null;
};

export type VendaParaFiscal = {
  id: string;
  imovel: string;
  unidade: string | null;
  construtora: string | null;
  leadNome: string | null;
  dataVenda: string;
  valorVenda: number;
  comissaoValor: number;
  status: "ativa" | "distratada";
  comissaoRecebidaEm: string | null;
};

/** O que falta para a DIMOB de uma venda (lista vazia = completa). */
export function faltasDaDimob(venda: VendaParaFiscal, f: DadosFiscaisDaVenda | undefined): string[] {
  const faltas: string[] = [];
  const comprador = f?.compradorNome?.trim() || venda.leadNome?.trim();
  if (!comprador) faltas.push("nome do comprador");
  if (!f?.compradorDocumento) faltas.push("CPF/CNPJ do comprador");
  const vendedor = f?.vendedorNome?.trim() || venda.construtora?.trim();
  if (!vendedor) faltas.push("nome do vendedor");
  if (!f?.vendedorDocumento) faltas.push("CPF/CNPJ do vendedor");
  return faltas;
}

/** Comissão que já entrou e ainda não tem nota fiscal registrada. */
export function semNotaFiscal(vendas: VendaParaFiscal[], fiscal: Map<string, DadosFiscaisDaVenda>): VendaParaFiscal[] {
  return vendas
    .filter((v) => v.status === "ativa" && v.comissaoRecebidaEm !== null && !fiscal.get(v.id)?.notaNumero)
    .sort((a, b) => (a.comissaoRecebidaEm ?? "").localeCompare(b.comissaoRecebidaEm ?? ""));
}

/** Vendas intermediadas no ano (distrato fica de fora: a operação não existiu). */
export function vendasDoAno(vendas: VendaParaFiscal[], ano: string): VendaParaFiscal[] {
  return vendas.filter((v) => v.status === "ativa" && v.dataVenda.startsWith(ano)).sort((a, b) => a.dataVenda.localeCompare(b.dataVenda));
}

/** Problemas no que o gestor digitou (vazio = pode salvar). */
export function problemasDosDadosFiscais(f: Omit<DadosFiscaisDaVenda, "vendaId">): string[] {
  const p: string[] = [];
  if (f.compradorDocumento && !documentoValido(f.compradorDocumento)) p.push("O CPF/CNPJ do comprador não confere. Confira os números.");
  if (f.vendedorDocumento && !documentoValido(f.vendedorDocumento)) p.push("O CPF/CNPJ do vendedor não confere. Confira os números.");
  if (f.notaEmitidaEm && !/^\d{4}-\d{2}-\d{2}$/.test(f.notaEmitidaEm)) p.push("Data da nota inválida.");
  if (f.notaEmitidaEm && !f.notaNumero?.trim()) p.push("Informe o número da nota junto com a data.");
  return p;
}

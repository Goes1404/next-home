/**
 * Os parâmetros fiscais NACIONAIS (0232): tabela do IRRF, redutor da Lei
 * 15.270/2025, teto e alíquotas do INSS. Mudam por lei e por portaria, não
 * por empresa, então são da plataforma (iguais para todo grupo) e cada linha
 * diz desde quando vale e de onde veio. O cálculo escolhe a linha vigente na
 * DATA DO PAGAMENTO: um RPA de dezembro/2025 usa o teto de 2025 mesmo
 * calculado em 2026.
 *
 * Regime e alíquota efetiva do Simples continuam por grupo, em `fiscal_config`.
 */

export type ChaveFiscal =
  | "irrf_faixas"
  | "irrf_desconto_simplificado"
  | "irrf_redutor"
  | "inss_teto"
  | "inss_autonomo"
  | "inss_patronal";

export type LinhaDeParametro = {
  chave: ChaveFiscal;
  /** "aaaa-mm-dd" */
  vigenteDesde: string;
  /** O que o banco guarda em `valor` (jsonb). Faixa sem teto vem com `ate: null`. */
  valor: unknown;
  fonte: string;
  fonteUrl: string | null;
};

export type FaixaIrrf = { ate: number; aliquota: number; deducao: number };
export type RedutorIrrf = { isentoAte: number; ate: number; a: number; b: number };

export type ParametrosFiscais = {
  faixasIrrf: FaixaIrrf[];
  descontoSimplificado: number;
  /** `null` antes de 2026: não havia redução. */
  redutor: RedutorIrrf | null;
  tetoInss: number;
  /** Retido do corretor autônomo (fração). */
  inssAutonomo: number;
  /** Pago pela imobiliária fora do Simples (fração). */
  inssPatronal: number;
  origem: { chave: ChaveFiscal; vigenteDesde: string; fonte: string; fonteUrl: string | null }[];
};

const CHAVES: ChaveFiscal[] = [
  "irrf_faixas",
  "irrf_desconto_simplificado",
  "irrf_redutor",
  "inss_teto",
  "inss_autonomo",
  "inss_patronal",
];

const TABELA_IRRF = "Tabela progressiva mensal do IRRF (MP 1.294/2025)";
const LEI_8212 = "Lei 8.212/1991, arts. 21 e 22";

/**
 * As mesmas linhas do seed da 0232. Servem de reserva quando a tabela ainda
 * não existe no banco (antes da 0232), como os outros `*_PADRAO` do módulo.
 */
export const LINHAS_PADRAO: LinhaDeParametro[] = [
  {
    chave: "irrf_faixas",
    vigenteDesde: "2025-05-01",
    valor: [
      { ate: 2428.8, aliquota: 0, deducao: 0 },
      { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
      { ate: null, aliquota: 0.275, deducao: 908.73 },
    ],
    fonte: TABELA_IRRF,
    fonteUrl: null,
  },
  { chave: "irrf_desconto_simplificado", vigenteDesde: "2025-05-01", valor: 607.2, fonte: TABELA_IRRF, fonteUrl: null },
  { chave: "irrf_redutor", vigenteDesde: "2025-05-01", valor: null, fonte: "Sem redução antes da Lei 15.270/2025", fonteUrl: null },
  {
    chave: "irrf_redutor",
    vigenteDesde: "2026-01-01",
    valor: { isentoAte: 5000, ate: 7350, a: 978.62, b: 0.133145 },
    fonte: "Lei 15.270/2025",
    fonteUrl: null,
  },
  { chave: "inss_teto", vigenteDesde: "2025-01-01", valor: 8157.41, fonte: "Portaria Interministerial MPS/MF de reajuste de 2025 (teto usado até a 0232)", fonteUrl: null },
  { chave: "inss_teto", vigenteDesde: "2026-01-01", valor: 8475.55, fonte: "Portaria Interministerial MPS/MF 13/2026", fonteUrl: null },
  { chave: "inss_autonomo", vigenteDesde: "2025-01-01", valor: 0.11, fonte: `${LEI_8212} (retenção de 11% do contribuinte individual)`, fonteUrl: null },
  { chave: "inss_patronal", vigenteDesde: "2025-01-01", valor: 0.2, fonte: `${LEI_8212} (20% da empresa fora do Simples)`, fonteUrl: null },
];

const vigente = (linhas: LinhaDeParametro[], chave: ChaveFiscal, data: string) => {
  let melhor: LinhaDeParametro | null = null;
  for (const l of linhas) {
    if (l.chave !== chave || l.vigenteDesde > data) continue;
    if (!melhor || l.vigenteDesde > melhor.vigenteDesde) melhor = l;
  }
  if (!melhor) throw new Error(`parametro_fiscal_ausente:${chave}`);
  return melhor;
};

export function parametrosNaData(linhas: LinhaDeParametro[], data: string): ParametrosFiscais {
  const v = Object.fromEntries(CHAVES.map((c) => [c, vigente(linhas, c, data)])) as Record<ChaveFiscal, LinhaDeParametro>;
  const faixas = (v.irrf_faixas.valor as { ate: number | null; aliquota: number; deducao: number }[]).map((f) => ({
    ate: f.ate === null ? Infinity : Number(f.ate),
    aliquota: Number(f.aliquota),
    deducao: Number(f.deducao),
  }));
  return {
    faixasIrrf: faixas,
    descontoSimplificado: Number(v.irrf_desconto_simplificado.valor),
    redutor: (v.irrf_redutor.valor as RedutorIrrf | null) ?? null,
    tetoInss: Number(v.inss_teto.valor),
    inssAutonomo: Number(v.inss_autonomo.valor),
    inssPatronal: Number(v.inss_patronal.valor),
    origem: CHAVES.map((c) => ({ chave: c, vigenteDesde: v[c].vigenteDesde, fonte: v[c].fonte, fonteUrl: v[c].fonteUrl })),
  };
}

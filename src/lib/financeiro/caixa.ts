import { centavos } from "./venda";

/**
 * O caixa da imobiliária (0166): contas a pagar e a receber, saldo de hoje e
 * fluxo dos próximos 90 dias. Módulo puro, sem banco: a tela e os testes
 * passam os dados e recebem as contas prontas.
 *
 * O dinheiro vem de três lugares e nunca é contado duas vezes:
 *  - lançamentos do caixa (aluguel, salários, portais, outras receitas);
 *  - comissão de venda a receber da construtora (sai de `vendas`);
 *  - repasse de venda a pagar ao corretor (sai de `venda_participantes`).
 *
 * Duas escolhas conservadoras, de propósito, porque o erro que custa caro é o
 * caixa parecer melhor do que está:
 *  - entrada ATRASADA fica fora da projeção (é dinheiro que não veio na data);
 *    saída atrasada entra hoje (a conta continua devida);
 *  - comissão sem data prevista fica fora da projeção, num total à parte.
 */

export type TipoMovimento = "entrada" | "saida";

export const CATEGORIAS = [
  "aluguel",
  "pessoal",
  "impostos",
  "marketing",
  "portais",
  "sistemas",
  "contabilidade",
  "escritorio",
  "comissao_avulsa",
  "outras_receitas",
  "outros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const ROTULO_CATEGORIA: Record<Categoria, string> = {
  aluguel: "Aluguel e condomínio",
  pessoal: "Salários e pessoal",
  impostos: "Impostos e taxas",
  marketing: "Marketing e anúncios",
  portais: "Portais imobiliários",
  sistemas: "Sistemas e assinaturas",
  contabilidade: "Contabilidade",
  escritorio: "Escritório e manutenção",
  comissao_avulsa: "Comissão avulsa",
  outras_receitas: "Outras receitas",
  outros: "Outros",
};

/** Categorias que fazem sentido em cada tipo, para o formulário. */
export const CATEGORIAS_DO_TIPO: Record<TipoMovimento, Categoria[]> = {
  entrada: ["comissao_avulsa", "outras_receitas", "outros"],
  saida: ["aluguel", "pessoal", "impostos", "marketing", "portais", "sistemas", "contabilidade", "escritorio", "outros"],
};

export type LancamentoDoCaixa = {
  id: string;
  tipo: TipoMovimento;
  categoria: Categoria;
  descricao: string;
  valor: number;
  vencimento: string;
  pagoEm: string | null;
  recorrenciaId: string | null;
};

/** O pedaço de uma venda que o caixa precisa. */
export type VendaDoCaixa = {
  id: string;
  imovel: string;
  unidade: string | null;
  construtora: string | null;
  status: "ativa" | "distratada";
  comissaoValor: number;
  comissaoPrevistaEm: string | null;
  comissaoRecebidaEm: string | null;
  participantes: { corretorId: string; nome: string; repasseValor: number; repassePagoEm: string | null }[];
};

export type OrigemMovimento = "lancamento" | "comissao" | "repasse";

export type Movimento = {
  /** Único na tela: origem + id(s). */
  chave: string;
  origem: OrigemMovimento;
  tipo: TipoMovimento;
  descricao: string;
  detalhe: string | null;
  categoria: Categoria | null;
  valor: number;
  /** Quando deve entrar ou sair. `null` = comissão sem data prevista. */
  vencimento: string | null;
  pagoEm: string | null;
  lancamentoId?: string;
  vendaId?: string;
  corretorId?: string;
};

export function movimentosDo(lancamentos: LancamentoDoCaixa[], vendas: VendaDoCaixa[]): Movimento[] {
  const lista: Movimento[] = lancamentos.map((l) => ({
    chave: `l:${l.id}`,
    origem: "lancamento",
    tipo: l.tipo,
    descricao: l.descricao,
    detalhe: ROTULO_CATEGORIA[l.categoria],
    categoria: l.categoria,
    valor: centavos(l.valor),
    vencimento: l.vencimento,
    pagoEm: l.pagoEm,
    lancamentoId: l.id,
  }));

  for (const v of vendas) {
    if (v.status !== "ativa") continue;
    const nome = v.unidade ? `${v.imovel} · ${v.unidade}` : v.imovel;
    if (v.comissaoValor > 0) {
      lista.push({
        chave: `c:${v.id}`,
        origem: "comissao",
        tipo: "entrada",
        descricao: `Comissão ${nome}`,
        detalhe: v.construtora,
        categoria: null,
        valor: centavos(v.comissaoValor),
        vencimento: v.comissaoPrevistaEm,
        pagoEm: v.comissaoRecebidaEm,
        vendaId: v.id,
      });
    }
    for (const p of v.participantes) {
      if (p.repasseValor <= 0) continue;
      lista.push({
        chave: `r:${v.id}:${p.corretorId}`,
        origem: "repasse",
        tipo: "saida",
        descricao: `Repasse ${p.nome}`,
        detalhe: nome,
        categoria: null,
        valor: centavos(p.repasseValor),
        // O repasse sai quando a comissão entra: se já entrou, está devido
        // desde então; se não, acompanha a previsão da construtora.
        vencimento: v.comissaoRecebidaEm ?? v.comissaoPrevistaEm,
        pagoEm: p.repassePagoEm,
        vendaId: v.id,
        corretorId: p.corretorId,
      });
    }
  }
  return lista;
}

/** Soma ou subtrai dias de uma data "aaaa-mm-dd", sem fuso. */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Mesma data N meses depois. Dia que não existe no mês vira o último dia
 * (31/01 + 1 mês = 28 ou 29/02), como faz o boleto de aluguel.
 */
export function somarMeses(iso: string, meses: number, diaOriginal?: number): string {
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7)) - 1 + meses;
  const dia = diaOriginal ?? Number(iso.slice(8, 10));
  const alvoAno = ano + Math.floor(mes / 12);
  const alvoMes = ((mes % 12) + 12) % 12;
  const ultimo = new Date(Date.UTC(alvoAno, alvoMes + 1, 0)).getUTCDate();
  const d = Math.min(dia, ultimo);
  return `${alvoAno}-${String(alvoMes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** As datas de uma conta que se repete todo mês, a partir da primeira. */
export function vencimentosDaSerie(primeiro: string, meses: number): string[] {
  const dia = Number(primeiro.slice(8, 10));
  return Array.from({ length: meses }, (_, i) => somarMeses(primeiro, i, dia));
}

export const MESES_MAXIMOS_DA_SERIE = 24;

export type SaldoInformado = { valor: number; informadoEm: string };

/**
 * O saldo de hoje: o último informado mais o que entrou e menos o que saiu
 * DEPOIS daquele dia, até hoje. Sem saldo informado, não há saldo — a tela
 * pede o número em vez de começar do zero fingindo que é verdade.
 */
export function saldoDeHoje(saldo: SaldoInformado | null, movimentos: Movimento[], hoje: string): number | null {
  if (!saldo) return null;
  let total = saldo.valor;
  for (const m of movimentos) {
    if (!m.pagoEm || m.pagoEm <= saldo.informadoEm || m.pagoEm > hoje) continue;
    total += m.tipo === "entrada" ? m.valor : -m.valor;
  }
  return centavos(total);
}

export type SemanaDoFluxo = {
  inicio: string;
  fim: string;
  entradas: number;
  saidas: number;
  /** Saldo no fim da semana; `null` sem saldo informado. */
  saldoFinal: number | null;
};

export type FluxoDeCaixa = {
  saldoHoje: number | null;
  semanas: SemanaDoFluxo[];
  /** Pendentes com vencimento antes de hoje. */
  entradasAtrasadas: Movimento[];
  saidasAtrasadas: Movimento[];
  /** Comissões sem data prevista: fora da projeção. */
  semData: Movimento[];
  /** Primeiro dia em que o saldo projetado fica abaixo de zero. */
  ficaNegativoEm: string | null;
  menorSaldo: number | null;
  aReceber30: number;
  aPagar30: number;
  /** Realizado no mês corrente. */
  entrouNoMes: number;
  saiuNoMes: number;
};

export function fluxoDeCaixa(params: {
  movimentos: Movimento[];
  saldo: SaldoInformado | null;
  hoje: string;
  semanas?: number;
}): FluxoDeCaixa {
  const { movimentos, hoje } = params;
  const nSemanas = params.semanas ?? 13;
  const pendentes = movimentos.filter((m) => !m.pagoEm);

  const entradasAtrasadas = pendentes.filter((m) => m.tipo === "entrada" && m.vencimento !== null && m.vencimento < hoje);
  const saidasAtrasadas = pendentes.filter((m) => m.tipo === "saida" && m.vencimento !== null && m.vencimento < hoje);
  const semData = pendentes.filter((m) => m.vencimento === null);

  const saldoHoje = saldoDeHoje(params.saldo, movimentos, hoje);

  // Por dia, para achar o primeiro dia negativo (a semana esconde o dia).
  const entradasDia = new Map<string, number>();
  const saidasDia = new Map<string, number>();
  const somar = (mapa: Map<string, number>, dia: string, v: number) => mapa.set(dia, (mapa.get(dia) ?? 0) + v);
  for (const m of saidasAtrasadas) somar(saidasDia, hoje, m.valor);
  const fimDoHorizonte = somarDias(hoje, nSemanas * 7 - 1);
  for (const m of pendentes) {
    if (m.vencimento === null || m.vencimento < hoje || m.vencimento > fimDoHorizonte) continue;
    somar(m.tipo === "entrada" ? entradasDia : saidasDia, m.vencimento, m.valor);
  }

  const semanas: SemanaDoFluxo[] = [];
  let corrente = saldoHoje;
  let ficaNegativoEm: string | null = null;
  let menorSaldo: number | null = saldoHoje;
  for (let s = 0; s < nSemanas; s++) {
    const inicio = somarDias(hoje, s * 7);
    const fim = somarDias(inicio, 6);
    let entradas = 0;
    let saidas = 0;
    for (let d = 0; d < 7; d++) {
      const dia = somarDias(inicio, d);
      const e = entradasDia.get(dia) ?? 0;
      const sa = saidasDia.get(dia) ?? 0;
      if (e === 0 && sa === 0) continue;
      entradas += e;
      saidas += sa;
      if (corrente !== null) {
        corrente = centavos(corrente + e - sa);
        if (menorSaldo === null || corrente < menorSaldo) menorSaldo = corrente;
        if (corrente < 0 && ficaNegativoEm === null) ficaNegativoEm = dia;
      }
    }
    semanas.push({ inicio, fim, entradas: centavos(entradas), saidas: centavos(saidas), saldoFinal: corrente });
  }
  if (saldoHoje !== null && saldoHoje < 0) ficaNegativoEm = hoje;

  const em30 = somarDias(hoje, 29);
  const soma = (lista: Movimento[]) => centavos(lista.reduce((s, m) => s + m.valor, 0));
  const noHorizonte = (m: Movimento) => m.vencimento !== null && m.vencimento >= hoje && m.vencimento <= em30;
  const mes = hoje.slice(0, 7);
  const doMes = movimentos.filter((m) => m.pagoEm && m.pagoEm.slice(0, 7) === mes && m.pagoEm <= hoje);

  return {
    saldoHoje,
    semanas,
    entradasAtrasadas,
    saidasAtrasadas,
    semData,
    ficaNegativoEm,
    menorSaldo,
    aReceber30: soma(pendentes.filter((m) => m.tipo === "entrada" && noHorizonte(m))),
    aPagar30: soma([...saidasAtrasadas, ...pendentes.filter((m) => m.tipo === "saida" && noHorizonte(m))]),
    entrouNoMes: soma(doMes.filter((m) => m.tipo === "entrada")),
    saiuNoMes: soma(doMes.filter((m) => m.tipo === "saida")),
  };
}

/** Os próximos pendentes em ordem de data, para a lista de contas. */
export function proximosPendentes(movimentos: Movimento[], hoje: string, dias = 30): Movimento[] {
  const fim = somarDias(hoje, dias - 1);
  return movimentos
    .filter((m) => !m.pagoEm && m.vencimento !== null && m.vencimento >= hoje && m.vencimento <= fim)
    .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : a.vencimento! > b.vencimento! ? 1 : a.tipo === "entrada" ? -1 : 1));
}

export type LancamentoDigitado = {
  tipo: TipoMovimento;
  categoria: string;
  descricao: string;
  valor: number | null;
  vencimento: string;
  jaPago: boolean;
  repetirMeses: number;
};

export function problemasDoLancamento(l: LancamentoDigitado): string[] {
  const p: string[] = [];
  if (l.tipo !== "entrada" && l.tipo !== "saida") p.push("Escolha se é entrada ou saída.");
  if (!(CATEGORIAS as readonly string[]).includes(l.categoria)) p.push("Escolha a categoria.");
  if (!l.descricao.trim()) p.push("Descreva o lançamento.");
  if (l.descricao.trim().length > 200) p.push("A descrição passa de 200 caracteres.");
  if (l.valor === null || !(l.valor > 0)) p.push("Informe um valor maior que zero.");
  if (l.valor !== null && l.valor > 100_000_000) p.push("Valor alto demais. Confira os zeros.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.vencimento)) p.push("Informe a data de vencimento.");
  if (!Number.isInteger(l.repetirMeses) || l.repetirMeses < 1 || l.repetirMeses > MESES_MAXIMOS_DA_SERIE) {
    p.push(`Repita de 1 a ${MESES_MAXIMOS_DA_SERIE} meses.`);
  }
  if (l.jaPago && l.repetirMeses > 1) p.push("Lançamento já pago não se repete. Lance os próximos meses sem marcar como pago.");
  return p;
}

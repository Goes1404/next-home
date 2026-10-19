import { centavos, vgvCreditado } from "./venda";
import { mesAntes, NOMES_MES, type VendaDoPainel } from "./painelDeVendas";

/**
 * O painel interativo da tela de Vendas (07/10/2026), no estilo Power BI:
 * período, imóvel e (para o gestor) corretor escolhidos em cima, e tudo
 * embaixo recalculado. Módulo PURO, roda no navegador a cada clique.
 *
 * Mesma régua de `montarPainelDeVendas`: venda distratada fica de fora; o
 * corretor soma a PARTE dele (e a comissão dele é o repasse); o gestor soma a
 * equipe (e a comissão é a da imobiliária). Quando o gestor escolhe um
 * corretor, o painel passa a contar como se fosse esse corretor olhando.
 *
 * A comissão aqui é a das vendas FEITAS no período, não a que entrou no
 * período: o dinheiro que entrou mora no Extrato e no Caixa.
 */

export type VendaDoIndicador = Omit<VendaDoPainel, "participantes"> & {
  participantes: (VendaDoPainel["participantes"][number] & { nome: string })[];
};

export type PeriodoDeVendas = "mes" | 3 | 6 | 12 | "ano";

export const PERIODOS_DE_VENDAS: { valor: PeriodoDeVendas; rotulo: string }[] = [
  { valor: "mes", rotulo: "Este mês" },
  { valor: 3, rotulo: "3 meses" },
  { valor: 6, rotulo: "6 meses" },
  { valor: 12, rotulo: "12 meses" },
  { valor: "ano", rotulo: "Este ano" },
];

export type FiltroDeVendas = {
  periodo: PeriodoDeVendas;
  imovel: string | null;
  /** Só o gestor escolhe; para o corretor é sempre ele mesmo. */
  corretorId: string | null;
};

export type JanelaDeMeses = { meses: string[]; anterior: string[] };

/** Os meses ("aaaa-mm") do período e os do período anterior de mesmo tamanho. */
export function janelaDeMeses(hoje: string, periodo: PeriodoDeVendas): JanelaDeMeses {
  if (periodo === "ano") {
    const quantos = Number(hoje.slice(5, 7));
    const meses = Array.from({ length: quantos }, (_, i) => mesAntes(hoje, quantos - 1 - i));
    // O mesmo trecho do ano passado: jan..mês atual de um ano antes.
    const anterior = meses.map((m) => `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`);
    return { meses, anterior };
  }
  const n = periodo === "mes" ? 1 : periodo;
  const meses = Array.from({ length: n }, (_, i) => mesAntes(hoje, n - 1 - i));
  const anterior = Array.from({ length: n }, (_, i) => mesAntes(hoje, 2 * n - 1 - i));
  return { meses, anterior };
}

export const rotuloDoMes = (mes: string) => `${NOMES_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/** De quem é o olhar: o corretor logado, o corretor escolhido pelo gestor, ou a equipe (null). */
export const olharDe = (escopo: string | null, filtro: FiltroDeVendas) => escopo ?? filtro.corretorId;

function parteDe(v: VendaDoIndicador, corretorId: string | null): number {
  if (corretorId === null) return 100;
  return v.participantes.filter((p) => p.corretorId === corretorId).reduce((s, p) => s + p.partePercentual, 0);
}

/** As vendas que contam para o olhar e o imóvel escolhidos (qualquer mês). */
function contadas(vendas: VendaDoIndicador[], corretorId: string | null, imovel: string | null) {
  return vendas.filter((v) => v.status === "ativa" && parteDe(v, corretorId) > 0 && (!imovel || v.imovel === imovel));
}

export type IndicadoresDeVendas = {
  vgv: number;
  vendas: number;
  ticketMedio: number | null;
  comissao: { recebida: number; liberada: number; aguardando: number; total: number };
};

export function indicadoresDosMeses(
  vendas: VendaDoIndicador[],
  meses: string[],
  corretorId: string | null,
  imovel: string | null,
): IndicadoresDeVendas {
  const noPeriodo = new Set(meses);
  const lista = contadas(vendas, corretorId, imovel).filter((v) => noPeriodo.has(v.dataVenda.slice(0, 7)));
  const vgv = centavos(lista.reduce((s, v) => s + vgvCreditado(v, parteDe(v, corretorId)), 0));
  const comissao = { recebida: 0, liberada: 0, aguardando: 0, total: 0 };
  for (const v of lista) {
    if (corretorId === null) {
      if (v.comissaoRecebidaEm) comissao.recebida += v.comissaoValor;
      else comissao.aguardando += v.comissaoValor;
      continue;
    }
    for (const p of v.participantes.filter((x) => x.corretorId === corretorId)) {
      if (p.repassePagoEm) comissao.recebida += p.repasseValor;
      else if (v.comissaoRecebidaEm) comissao.liberada += p.repasseValor;
      else comissao.aguardando += p.repasseValor;
    }
  }
  comissao.recebida = centavos(comissao.recebida);
  comissao.liberada = centavos(comissao.liberada);
  comissao.aguardando = centavos(comissao.aguardando);
  comissao.total = centavos(comissao.recebida + comissao.liberada + comissao.aguardando);
  return { vgv, vendas: lista.length, ticketMedio: lista.length ? Math.round(vgv / lista.length) : null, comissao };
}

export type MesDoIndicador = { mes: string; rotulo: string; noPeriodo: boolean } & IndicadoresDeVendas;

/** Série mensal para as colunas e as tendências: no mínimo 6 meses, no máximo 12. */
export function serieMensal(
  vendas: VendaDoIndicador[],
  hoje: string,
  janela: JanelaDeMeses,
  corretorId: string | null,
  imovel: string | null,
): MesDoIndicador[] {
  const quantos = Math.min(12, Math.max(6, janela.meses.length));
  const noPeriodo = new Set(janela.meses);
  return Array.from({ length: quantos }, (_, i) => {
    const mes = mesAntes(hoje, quantos - 1 - i);
    return { mes, rotulo: rotuloDoMes(mes), noPeriodo: noPeriodo.has(mes), ...indicadoresDosMeses(vendas, [mes], corretorId, imovel) };
  });
}

export type FatiaDeImovel = { imovel: string; vgv: number; vendas: number; cor: number | null };

/**
 * A cor de cada imóvel segue o ranking de TODAS as vendas do olhar, não o do
 * período: trocar o período não repinta o imóvel. Os cinco maiores ganham cor
 * (1 a 5); o resto vira "Outros", em cinza.
 */
export function coresDosImoveis(vendas: VendaDoIndicador[], corretorId: string | null): Map<string, number> {
  const soma = new Map<string, number>();
  for (const v of contadas(vendas, corretorId, null)) soma.set(v.imovel, (soma.get(v.imovel) ?? 0) + vgvCreditado(v, parteDe(v, corretorId)));
  const ordem = [...soma.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return new Map(ordem.slice(0, 5).map(([imovel], i) => [imovel, i + 1]));
}

export const OUTROS = "Outros";

/** VGV por imóvel no período (todos os imóveis, para o filtro poder recortar). */
export function imoveisDoPeriodo(vendas: VendaDoIndicador[], meses: string[], corretorId: string | null): FatiaDeImovel[] {
  const cores = coresDosImoveis(vendas, corretorId);
  const noPeriodo = new Set(meses);
  const porImovel = new Map<string, { vgv: number; vendas: number }>();
  for (const v of contadas(vendas, corretorId, null)) {
    if (!noPeriodo.has(v.dataVenda.slice(0, 7))) continue;
    const chave = cores.has(v.imovel) ? v.imovel : OUTROS;
    const atual = porImovel.get(chave) ?? { vgv: 0, vendas: 0 };
    porImovel.set(chave, { vgv: atual.vgv + vgvCreditado(v, parteDe(v, corretorId)), vendas: atual.vendas + 1 });
  }
  return [...porImovel.entries()]
    .map(([imovel, x]) => ({ imovel, vgv: centavos(x.vgv), vendas: x.vendas, cor: cores.get(imovel) ?? null }))
    .sort((a, b) => (a.cor ?? 99) - (b.cor ?? 99));
}

export type LinhaDeCorretor = { corretorId: string; nome: string; vgv: number; vendas: number };

/** VGV de cada corretor no período (a parte dele), para o gestor. */
export function corretoresDoPeriodo(vendas: VendaDoIndicador[], meses: string[], imovel: string | null): LinhaDeCorretor[] {
  const noPeriodo = new Set(meses);
  const porCorretor = new Map<string, LinhaDeCorretor>();
  for (const v of contadas(vendas, null, imovel)) {
    if (!noPeriodo.has(v.dataVenda.slice(0, 7))) continue;
    for (const p of v.participantes) {
      if (p.partePercentual <= 0) continue;
      const atual = porCorretor.get(p.corretorId) ?? { corretorId: p.corretorId, nome: p.nome || "Corretor", vgv: 0, vendas: 0 };
      atual.vgv += vgvCreditado(v, p.partePercentual);
      atual.vendas += 1;
      porCorretor.set(p.corretorId, atual);
    }
  }
  return [...porCorretor.values()]
    .map((l) => ({ ...l, vgv: centavos(l.vgv) }))
    .sort((a, b) => b.vgv - a.vgv || a.nome.localeCompare(b.nome));
}

/** Variação em % do atual sobre o anterior; null sem base para comparar. */
export function variacaoDe(atual: number | null, anterior: number | null): number | null {
  if (atual === null || anterior === null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** O que viaja para o navegador: sem lead, sem observação, sem construtora. */
export function paraOIndicador(vendas: VendaDoIndicador[]): VendaDoIndicador[] {
  return vendas.map((v) => ({
    dataVenda: v.dataVenda,
    valorVenda: v.valorVenda,
    comissaoValor: v.comissaoValor,
    status: v.status,
    comissaoRecebidaEm: v.comissaoRecebidaEm,
    imovel: v.imovel,
    participantes: v.participantes.map((p) => ({
      corretorId: p.corretorId,
      nome: p.nome,
      partePercentual: p.partePercentual,
      repasseValor: p.repasseValor,
      repassePagoEm: p.repassePagoEm,
    })),
  }));
}

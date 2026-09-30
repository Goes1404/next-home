/**
 * Quanto cada anúncio e cada campanha rendeu (27/09/2026). Módulo PURO.
 *
 * O gasto é o que o corretor digitou; os leads vêm da tabela `leads`. Um lead
 * pertence a uma linha por três caminhos:
 *
 * 1. o id do anúncio na Meta (`meta_ad_id`), que o webhook grava sozinho;
 * 2. o anúncio sem etiqueta (só o texto padrão da Meta o identificou), que
 *    junta todos os leads assim do corretor numa linha;
 * 3. `leads.impulsionamento_id`, quando o corretor diz de qual campanha veio
 *    um cliente de outro canal (0132).
 *
 * Um anúncio detectado pode ser AGRUPADO numa campanha do corretor
 * (`agrupadoEm`, 0132): os clientes e o gasto dele passam a contar na
 * campanha, e o anúncio sai da lista de cima.
 */
import { TITULO_SEM_ETIQUETA } from "@/lib/whatsapp/anuncioMeta";

export const CANAIS_DE_CAMPANHA = {
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  portal: "Portal",
  outro: "Outro",
} as const;
export type CanalDeCampanha = keyof typeof CANAIS_DE_CAMPANHA;

export type LinhaImpulsionamento = {
  id: string;
  corretorId: string;
  chave: string;
  titulo: string | null;
  url: string | null;
  empreendimentoId: string | null;
  valorGasto: number | null;
  primeiroLeadEm: string;
  ultimoLeadEm: string;
  criadaPeloCorretor?: boolean;
  canal?: CanalDeCampanha | null;
  inicio?: string | null;
  fim?: string | null;
  agrupadoEm?: string | null;
};

export type Temperatura = "quente" | "morno" | "frio";

export type LeadDeAnuncio = {
  id?: string;
  corretorId: string | null;
  metaAdId: string | null;
  anuncioOrigem: string | null;
  etapa: string;
  visitaAgendadaEm: string | null;
  impulsionamentoId?: string | null;
  /** A leitura da IA sobre o lead; null quando ainda não houve conversa lida. */
  temperatura?: Temperatura | null;
  /** Quando o lead nasceu (ISO); é o que põe o cliente na linha do tempo. */
  criadoEm?: string;
  /** Quantas mensagens o cliente mandou no WhatsApp (todas as conversas dele). */
  falasDoCliente?: number;
  /** Disse renda ou orçamento (na ficha: pela conversa ou pelo corretor). */
  capacidadeDita?: boolean;
  /** Pediu para não ser mais contatado. */
  pediuParaSair?: boolean;
};

/**
 * A qualidade medida pelo que o cliente FEZ, não só pela leitura da IA.
 * Cada degrau contém os de baixo: quem visitou também conversou.
 *
 * - conversaram: mandaram 2+ mensagens. No anúncio de WhatsApp a primeira
 *   mensagem vem pronta do botão, então 1 fala só não diz nada.
 * - qualificados: disseram renda ou orçamento, ou a IA leu quente/morno.
 * - visitaram: visita marcada, ou etapa de visita em diante.
 * - fecharam: etapa fechado.
 *
 * `sairam` corre por fora: pediu para parar ou foi marcado como perdido.
 */
export type Degraus = {
  chegaram: number;
  conversaram: number;
  qualificados: number;
  visitaram: number;
  fecharam: number;
  sairam: number;
};

/** Abaixo disso a porcentagem é ruído: 1 de 2 vira "50%". */
export const MINIMO_PARA_PORCENTAGEM = 5;

const PORTAS_DE_QUALIFICACAO: Temperatura[] = ["quente", "morno"];

/** O degrau mais alto que o cliente alcançou: 0 chegou … 4 fechou. */
export function degrauDoCliente(l: LeadDeAnuncio): 0 | 1 | 2 | 3 | 4 {
  if (l.etapa === "fechado") return 4;
  if (l.visitaAgendadaEm !== null || ETAPAS_DE_VISITA_EM_DIANTE.has(l.etapa)) return 3;
  if (l.capacidadeDita || (l.temperatura && PORTAS_DE_QUALIFICACAO.includes(l.temperatura))) return 2;
  if ((l.falasDoCliente ?? 0) >= 2) return 1;
  return 0;
}

export function contarDegraus(leads: LeadDeAnuncio[]): Degraus {
  const d: Degraus = { chegaram: leads.length, conversaram: 0, qualificados: 0, visitaram: 0, fecharam: 0, sairam: 0 };
  for (const l of leads) {
    const g = degrauDoCliente(l);
    if (g >= 1) d.conversaram += 1;
    if (g >= 2) d.qualificados += 1;
    if (g >= 3) d.visitaram += 1;
    if (g >= 4) d.fecharam += 1;
    if (l.pediuParaSair || l.etapa === "perdido") d.sairam += 1;
  }
  return d;
}

/** Porcentagem inteira; null quando a amostra é pequena demais para dizer. */
export function porcentagem(parte: number, total: number): number | null {
  if (total < MINIMO_PARA_PORCENTAGEM) return null;
  return Math.round((parte / total) * 100);
}

export type ResumoImpulsionamento = LinhaImpulsionamento & {
  leads: number;
  visitas: number;
  fechados: number;
  perdidos: number;
  degraus: Degraus;
  /** Gasto da linha somado ao dos anúncios agrupados nela; null se ninguém informou. */
  gastoTotal: number | null;
  custoPorLead: number | null;
  custoPorVisita: number | null;
  /** Quanto custou cada cliente qualificado (disse renda/orçamento ou esquentou). */
  custoPorQualificado: number | null;
  /** % de qualificados entre os que chegaram; null com menos de 5 clientes. */
  taxaDeQualificados: number | null;
  /** Os anúncios detectados que foram agrupados nesta campanha. */
  anuncios: LinhaImpulsionamento[];
  /** Quando cada cliente desta linha nasceu (ISO), para a linha do tempo. */
  datasDosLeads: string[];
};

const ETAPAS_DE_VISITA_EM_DIANTE = new Set(["visita_agendada", "documentacao", "fechado"]);

function doAnuncio(linha: LinhaImpulsionamento, lead: LeadDeAnuncio): boolean {
  if (lead.corretorId !== linha.corretorId) return false;
  if (lead.impulsionamentoId === linha.id) return true;
  if (linha.criadaPeloCorretor) return false;
  if (linha.chave === "sem-etiqueta") {
    return lead.metaAdId === null && lead.anuncioOrigem === TITULO_SEM_ETIQUETA;
  }
  return lead.metaAdId === linha.chave;
}

function dividir(valor: number | null, por: number): number | null {
  if (valor === null || por === 0) return null;
  return Math.round((valor / por) * 100) / 100;
}

function somaDeGasto(linhas: LinhaImpulsionamento[]): number | null {
  const informados = linhas.filter((l) => l.valorGasto !== null);
  if (informados.length === 0) return null;
  return Math.round(informados.reduce((s, l) => s + (l.valorGasto ?? 0), 0) * 100) / 100;
}

/**
 * Um resumo por linha de CIMA da lista: a campanha (com os anúncios agrupados
 * nela) ou o anúncio solto. O anúncio agrupado não vira resumo próprio — o
 * cliente dele contaria duas vezes.
 */
export function resumirImpulsionamentos(
  linhas: LinhaImpulsionamento[],
  leads: LeadDeAnuncio[],
): ResumoImpulsionamento[] {
  const idsDeCima = new Set(linhas.filter((l) => !l.agrupadoEm).map((l) => l.id));
  // Anúncio agrupado numa campanha que sumiu (apagada fora da tela) volta a
  // ser linha de cima, em vez de desaparecer com os clientes dentro.
  const deCima = linhas.filter((l) => !l.agrupadoEm || !idsDeCima.has(l.agrupadoEm));

  return deCima.map((linha) => {
    const anuncios = linhas.filter((l) => l.agrupadoEm === linha.id);
    const todas = [linha, ...anuncios];
    const vistos = new Set<LeadDeAnuncio>();
    const meus = leads.filter((l) => {
      if (vistos.has(l) || !todas.some((t) => doAnuncio(t, l))) return false;
      vistos.add(l);
      return true;
    });

    const visitas = meus.filter(
      (l) => l.visitaAgendadaEm !== null || ETAPAS_DE_VISITA_EM_DIANTE.has(l.etapa),
    ).length;
    const degraus = contarDegraus(meus);
    const gastoTotal = somaDeGasto(todas);

    return {
      ...linha,
      anuncios,
      datasDosLeads: meus.map((l) => l.criadoEm).filter((d): d is string => Boolean(d)),
      leads: meus.length,
      visitas,
      fechados: meus.filter((l) => l.etapa === "fechado").length,
      perdidos: meus.filter((l) => l.etapa === "perdido").length,
      degraus,
      gastoTotal,
      custoPorLead: dividir(gastoTotal, meus.length),
      custoPorVisita: dividir(gastoTotal, visitas),
      custoPorQualificado: dividir(gastoTotal, degraus.qualificados),
      taxaDeQualificados: porcentagem(degraus.qualificados, meus.length),
    };
  });
}

/**
 * Os totais do topo da tela, degrau por degrau: quantos clientes, quantos se
 * qualificaram, quantos visitaram, quantos fecharam, e quanto custou cada um.
 *
 * Contagem e custo usam a MESMA população: só as campanhas com gasto
 * informado. Antes a tela somava os clientes de todas e dividia o gasto só
 * pelos das que tinham valor, então "30 clientes" e "R$ 52 por cliente" não
 * batiam na conta de ninguém. Os clientes das campanhas sem valor aparecem à
 * parte (`clientesSemGasto`), para não sumirem.
 */
export function totaisDosImpulsionamentos(resumos: ResumoImpulsionamento[]) {
  const comGasto = resumos.filter((r) => r.gastoTotal !== null);
  const semGasto = resumos.filter((r) => r.gastoTotal === null);
  const gasto = Math.round(comGasto.reduce((s, r) => s + (r.gastoTotal ?? 0), 0) * 100) / 100;
  const soma = (lista: ResumoImpulsionamento[], k: keyof Omit<Degraus, "sairam">) =>
    lista.reduce((s, r) => s + r.degraus[k], 0);
  const informado = comGasto.length > 0 ? gasto : null;
  const degraus = {
    clientes: soma(comGasto, "chegaram"),
    qualificados: soma(comGasto, "qualificados"),
    visitas: soma(comGasto, "visitaram"),
    fechados: soma(comGasto, "fecharam"),
  };
  return {
    anuncios: resumos.length,
    semGasto: semGasto.length,
    clientesSemGasto: soma(semGasto, "chegaram"),
    gasto,
    ...degraus,
    custoPorLead: dividir(informado, degraus.clientes),
    custoPorQualificado: dividir(informado, degraus.qualificados),
    custoPorVisita: dividir(informado, degraus.visitas),
    custoPorFechado: dividir(informado, degraus.fechados),
  };
}

export type CriterioDoComparativo = "visita" | "qualificado" | "cliente";

export type LinhaDoComparativo = {
  id: string;
  nome: string;
  gasto: number;
  leads: number;
  qualificados: number;
  visitas: number;
  custoPorLead: number | null;
  custoPorQualificado: number | null;
  custoPorVisita: number | null;
  /** Menos de 5 clientes: aparece, mas não disputa o "melhor". */
  pequena: boolean;
};

export type Comparativo = {
  linhas: LinhaDoComparativo[];
  /** O degrau que decide; null quando ainda não há duas campanhas para comparar. */
  criterio: CriterioDoComparativo | null;
  melhor: string | null;
  /** A segunda colocada, para a frase "R$ X contra R$ Y de fulana". */
  segunda: string | null;
};

const CUSTO_DO_CRITERIO: Record<CriterioDoComparativo, (l: LinhaDoComparativo) => number | null> = {
  visita: (l) => l.custoPorVisita,
  qualificado: (l) => l.custoPorQualificado,
  cliente: (l) => l.custoPorLead,
};

/**
 * A comparação entre campanhas com gasto informado, inclusive a que gastou e
 * não trouxe ninguém (é a pior de todas, e sumir com ela esconderia isso).
 *
 * Decide pelo degrau mais fundo que dá para comparar: custo por VISITA quando
 * duas campanhas com amostra tiveram visita; senão por qualificado; senão por
 * cliente. Cliente barato que não visita é o anúncio que parece bom e não
 * vende, e por isso a ordem e o "melhor" seguem o MESMO critério — antes a
 * lista ordenava por cliente e o selo ia para a melhor por visita, e a
 * primeira da lista não era a melhor.
 *
 * Campanha com menos de 5 clientes aparece, mas não disputa: 1 cliente que
 * visitou faria o custo por visita dela ganhar por sorte.
 */
export function compararCampanhas(
  resumos: ResumoImpulsionamento[],
  nomeDe: (r: ResumoImpulsionamento) => string,
): Comparativo {
  const linhas: LinhaDoComparativo[] = resumos
    .filter((r) => r.gastoTotal !== null)
    .map((r) => ({
      id: r.id,
      nome: nomeDe(r),
      gasto: r.gastoTotal as number,
      leads: r.leads,
      qualificados: r.degraus.qualificados,
      visitas: r.visitas,
      custoPorLead: r.custoPorLead,
      custoPorQualificado: r.custoPorQualificado,
      custoPorVisita: r.custoPorVisita,
      pequena: r.leads < MINIMO_PARA_PORCENTAGEM,
    }));

  const disputam = linhas.filter((l) => !l.pequena);
  const criterio =
    (["visita", "qualificado", "cliente"] as const).find(
      (c) => disputam.filter((l) => CUSTO_DO_CRITERIO[c](l) !== null).length >= 2,
    ) ?? null;

  const custo = (l: LinhaDoComparativo) => (criterio ? CUSTO_DO_CRITERIO[criterio](l) : l.custoPorLead);
  const grupo = (l: LinhaDoComparativo) => (l.leads === 0 ? 2 : l.pequena ? 1 : 0);
  linhas.sort((a, b) => {
    if (grupo(a) !== grupo(b)) return grupo(a) - grupo(b);
    if (grupo(a) === 2) return b.gasto - a.gasto;
    if (grupo(a) === 1) return b.leads - a.leads;
    const ca = custo(a);
    const cb = custo(b);
    if (ca === null && cb === null) return (a.custoPorLead ?? 0) - (b.custoPorLead ?? 0);
    if (ca === null) return 1;
    if (cb === null) return -1;
    return ca - cb;
  });

  const candidatas = criterio ? linhas.filter((l) => !l.pequena && custo(l) !== null) : [];
  return {
    linhas,
    criterio,
    melhor: candidatas[0]?.id ?? null,
    segunda: candidatas[1]?.id ?? null,
  };
}

/** "Até este dia, a campanha tinha gastado X" (0133). */
export type LinhaDeQualidade = { id: string; nome: string; degraus: Degraus };

/**
 * A qualidade lado a lado: toda campanha com cliente, com ou sem gasto (a
 * qualidade não depende do valor). As com amostra para porcentagem vêm
 * primeiro, da que mais qualifica para a que menos; as pequenas vão para o
 * fim, pela quantidade de clientes, porque "2 de 3" não ganha de "8 de 20".
 */
export function compararQualidade(
  resumos: ResumoImpulsionamento[],
  nomeDe: (r: ResumoImpulsionamento) => string,
): LinhaDeQualidade[] {
  const taxa = (d: Degraus) => porcentagem(d.qualificados, d.chegaram);
  return resumos
    .filter((r) => r.degraus.chegaram > 0)
    .map((r) => ({ id: r.id, nome: nomeDe(r), degraus: r.degraus }))
    .sort((a, b) => {
      const ta = taxa(a.degraus);
      const tb = taxa(b.degraus);
      if (ta !== null && tb !== null) return tb - ta || b.degraus.chegaram - a.degraus.chegaram;
      if (ta !== null) return -1;
      if (tb !== null) return 1;
      return b.degraus.chegaram - a.degraus.chegaram;
    });
}

export type PontoDeGasto = { impulsionamentoId: string; dia: string; valor: number };

export type PontoDaSerie = {
  /** Último dia da semana, "aaaa-mm-dd". */
  dia: string;
  /** Clientes que chegaram nesta semana (medido, nunca estimado). */
  novos: number;
  /** Gasto e clientes nas 4 semanas que terminam aqui. */
  gasto4: number;
  clientes4: number;
  /**
   * Custo por cliente nas últimas 4 semanas. null quando a campanha ainda
   * não juntou 3 clientes (o começo pula demais para dizer algo) ou quando
   * a janela não teve cliente nenhum.
   */
  custoMovel: number | null;
  /** Algum gasto foi registrado com data nesta semana; senão o valor é estimado. */
  informado: boolean;
};

const DIA_MS = 86_400_000;
const emMs = (dia: string) => Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10));
const deMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** O dia de São Paulo de um instante ISO (ou o próprio dia, se já vier assim). */
export function diaDe(iso: string): string {
  if (iso.length === 10) return iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * Quanto uma linha tinha gastado até o dia `d`.
 *
 * Os pontos são o que o corretor registrou ("até dia X, gastei Y"). Entre o
 * começo da campanha e o primeiro ponto, e entre dois pontos, o gasto é
 * distribuído por igual — é como Meta e Google gastam um orçamento diário.
 * Depois do último ponto, fica parado: não sabemos o que veio depois.
 * Ponto registrado depois do fim da campanha conta como gasto até o fim.
 */
export function gastoAte(
  linha: LinhaImpulsionamento,
  pontos: PontoDeGasto[],
  d: string,
  hoje: string,
): number {
  let pts = pontos
    .filter((p) => p.impulsionamentoId === linha.id)
    .map((p) => ({ dia: linha.fim && p.dia > linha.fim ? linha.fim : p.dia, valor: p.valor }))
    .sort((a, b) => a.dia.localeCompare(b.dia));
  if (pts.length === 0 && linha.valorGasto !== null) {
    pts = [{ dia: linha.fim && linha.fim < hoje ? linha.fim : hoje, valor: linha.valorGasto }];
  }
  if (pts.length === 0) return 0;

  const inicio = linha.inicio ?? diaDe(linha.primeiroLeadEm);
  if (d < inicio) return 0;
  let anterior = { dia: inicio, valor: 0 };
  for (const p of pts) {
    if (d < p.dia) {
      const total = emMs(p.dia) - emMs(anterior.dia);
      if (total <= 0) return p.valor;
      const fracao = (emMs(d) - emMs(anterior.dia)) / total;
      return anterior.valor + (p.valor - anterior.valor) * fracao;
    }
    anterior = p.dia >= anterior.dia ? p : { dia: anterior.dia, valor: p.valor };
  }
  return pts[pts.length - 1].valor;
}

/** Clientes mínimos para a linha começar: antes disso um cliente muda tudo. */
export const MINIMO_DE_CLIENTES_NA_SERIE = 3;
const JANELA_DIAS = 28;

/**
 * O custo por cliente ao longo do tempo, semana a semana (30/09/2026).
 *
 * Em cada fim de semana: o que foi gasto nas ÚLTIMAS 4 SEMANAS dividido pelos
 * clientes que chegaram nelas. Móvel, e não acumulado desde o começo: o
 * acumulado demora a mostrar piora (uma semana ruim quase não mexe na média),
 * e a pergunta do corretor é se a campanha está ficando cara AGORA. Quatro
 * semanas, e não uma, porque o custo de uma semana só pula demais.
 *
 * A linha só começa depois dos 3 primeiros clientes: antes, cada cliente muda
 * o número pela metade e o pico do começo esmagaria o resto do gráfico.
 *
 * `informado` separa o que foi medido do que é conta: sem registro de gasto
 * naquela semana, o valor vem da distribuição por igual (`gastoAte`).
 *
 * Só entram linhas com gasto informado — sem ele não existe custo.
 */
export function serieDeCusto(
  resumos: ResumoImpulsionamento[],
  pontos: PontoDeGasto[],
  hoje: string,
  semanas = 12,
): PontoDaSerie[] {
  const comGasto = resumos.filter((r) => r.gastoTotal !== null);
  if (comGasto.length === 0) return [];
  const linhas = comGasto.flatMap((r) => [r as LinhaImpulsionamento, ...r.anuncios]);
  const ids = new Set(linhas.map((l) => l.id));
  const registros = pontos.filter((p) => ids.has(p.impulsionamentoId)).map((p) => p.dia);
  const inicios = comGasto.map((r) => r.inicio ?? diaDe(r.primeiroLeadEm));
  const primeiro = inicios.reduce((a, b) => (a < b ? a : b));
  const dias = comGasto.flatMap((r) => r.datasDosLeads.map(diaDe));

  const gastoEm = (dia: string) => linhas.reduce((s, l) => s + gastoAte(l, pontos, dia, hoje), 0);
  const entre = (depoisDe: string, ate: string) => dias.filter((d) => d > depoisDe && d <= ate).length;
  const recuar = (dia: string, n: number) => deMs(emMs(dia) - n * DIA_MS);

  const serie: PontoDaSerie[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const dia = recuar(hoje, i * 7);
    if (dia < primeiro) continue;
    const inicioJanela = recuar(dia, JANELA_DIAS);
    const gasto4 = Math.round((gastoEm(dia) - gastoEm(inicioJanela)) * 100) / 100;
    const clientes4 = entre(inicioJanela, dia);
    const acumulados = dias.filter((d) => d <= dia).length;
    const semana = recuar(dia, 7);
    serie.push({
      dia,
      novos: entre(semana, dia),
      gasto4,
      clientes4,
      custoMovel: acumulados < MINIMO_DE_CLIENTES_NA_SERIE ? null : dividir(gasto4, clientes4),
      informado: registros.some((r) => r > semana && r <= dia),
    });
  }
  return serie;
}

/**
 * "R$ 50", "50,00", "1.250,90" → número. Vazio → null (apagar o gasto).
 * Texto que não é valor → NaN, para a action recusar com motivo.
 */
export function lerValorEmReais(entrada: string): number | null {
  const limpo = entrada.replace(/r\$/i, "").replace(/\s/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, "") // "1.250" é mil duzentos e cinquenta
      : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}

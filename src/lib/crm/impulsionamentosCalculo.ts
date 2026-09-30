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
};

/** Qualidade dos clientes que chegaram: quantos de cada temperatura. */
export type Qualidade = { quente: number; morno: number; frio: number; semLeitura: number };

export type ResumoImpulsionamento = LinhaImpulsionamento & {
  leads: number;
  visitas: number;
  fechados: number;
  perdidos: number;
  qualidade: Qualidade;
  /** Gasto da linha somado ao dos anúncios agrupados nela; null se ninguém informou. */
  gastoTotal: number | null;
  custoPorLead: number | null;
  custoPorVisita: number | null;
  /** Custo por cliente quente ou morno: quanto custou cada cliente que vale a conversa. */
  custoPorBomLead: number | null;
  /** % de quentes e mornos entre os que a IA já leu; null sem leitura nenhuma. */
  taxaDeBonsLeads: number | null;
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
    const qualidade: Qualidade = { quente: 0, morno: 0, frio: 0, semLeitura: 0 };
    for (const l of meus) {
      if (l.temperatura) qualidade[l.temperatura] += 1;
      else qualidade.semLeitura += 1;
    }
    const lidos = qualidade.quente + qualidade.morno + qualidade.frio;
    const bons = qualidade.quente + qualidade.morno;
    const gastoTotal = somaDeGasto(todas);

    return {
      ...linha,
      anuncios,
      datasDosLeads: meus.map((l) => l.criadoEm).filter((d): d is string => Boolean(d)),
      leads: meus.length,
      visitas,
      fechados: meus.filter((l) => l.etapa === "fechado").length,
      perdidos: meus.filter((l) => l.etapa === "perdido").length,
      qualidade,
      gastoTotal,
      custoPorLead: dividir(gastoTotal, meus.length),
      custoPorVisita: dividir(gastoTotal, visitas),
      custoPorBomLead: dividir(gastoTotal, bons),
      taxaDeBonsLeads: lidos === 0 ? null : Math.round((bons / lidos) * 100),
    };
  });
}

/** Os totais do topo da tela. Só entra no custo a linha com gasto informado. */
export function totaisDosImpulsionamentos(resumos: ResumoImpulsionamento[]) {
  const comGasto = resumos.filter((r) => r.gastoTotal !== null);
  const gasto = comGasto.reduce((s, r) => s + (r.gastoTotal ?? 0), 0);
  const leadsComGasto = comGasto.reduce((s, r) => s + r.leads, 0);
  const visitasComGasto = comGasto.reduce((s, r) => s + r.visitas, 0);
  return {
    anuncios: resumos.length,
    semGasto: resumos.length - comGasto.length,
    gasto,
    leads: resumos.reduce((s, r) => s + r.leads, 0),
    visitas: resumos.reduce((s, r) => s + r.visitas, 0),
    custoPorLead: dividir(comGasto.length ? gasto : null, leadsComGasto),
    custoPorVisita: dividir(comGasto.length ? gasto : null, visitasComGasto),
  };
}

export type LinhaDoComparativo = {
  id: string;
  nome: string;
  leads: number;
  custoPorLead: number;
  custoPorVisita: number | null;
  taxaDeBonsLeads: number | null;
  /** A de menor custo por visita (ou por cliente, se nenhuma tiver visita). */
  melhor: boolean;
};

/**
 * A comparação entre campanhas: só entra quem tem gasto E cliente — sem um
 * dos dois não existe custo por cliente para comparar. Ordem: a mais barata
 * por cliente primeiro.
 *
 * A "melhor" é a de menor custo por VISITA quando alguma teve visita: cliente
 * barato que não visita é o anúncio que parece bom e não vende.
 */
export function compararCampanhas(
  resumos: ResumoImpulsionamento[],
  nomeDe: (r: ResumoImpulsionamento) => string,
): LinhaDoComparativo[] {
  const linhas = resumos
    .filter((r) => r.custoPorLead !== null)
    .map((r) => ({
      id: r.id,
      nome: nomeDe(r),
      leads: r.leads,
      custoPorLead: r.custoPorLead as number,
      custoPorVisita: r.custoPorVisita,
      taxaDeBonsLeads: r.taxaDeBonsLeads,
      melhor: false,
    }))
    .sort((a, b) => a.custoPorLead - b.custoPorLead);
  if (linhas.length < 2) return linhas;

  const comVisita = linhas.filter((l) => l.custoPorVisita !== null);
  const melhor = comVisita.length
    ? comVisita.reduce((a, b) => ((b.custoPorVisita as number) < (a.custoPorVisita as number) ? b : a))
    : linhas[0];
  melhor.melhor = true;
  return linhas;
}

/** "Até este dia, a campanha tinha gastado X" (0133). */
export type PontoDeGasto = { impulsionamentoId: string; dia: string; valor: number };

export type PontoDaSerie = {
  /** Último dia da semana, "aaaa-mm-dd". */
  dia: string;
  gasto: number;
  clientes: number;
  custoPorCliente: number | null;
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

/**
 * O custo por cliente ao longo do tempo, semana a semana: no fim de cada
 * semana, o gasto acumulado dividido pelos clientes acumulados até ali.
 *
 * Acumulado, e não o da semana: numa semana sem cliente o custo "da semana"
 * seria infinito, e numa com um cliente só pularia para qualquer lado. O
 * acumulado mostra para onde a campanha está indo.
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
  const inicios = comGasto.map((r) => r.inicio ?? diaDe(r.primeiroLeadEm));
  const primeiro = inicios.reduce((a, b) => (a < b ? a : b));
  const dias = comGasto.flatMap((r) => r.datasDosLeads.map(diaDe));

  const serie: PontoDaSerie[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const dia = deMs(emMs(hoje) - i * 7 * DIA_MS);
    if (dia < primeiro) continue;
    const gasto = Math.round(linhas.reduce((s, l) => s + gastoAte(l, pontos, dia, hoje), 0) * 100) / 100;
    const clientes = dias.filter((d) => d <= dia).length;
    serie.push({ dia, gasto, clientes, custoPorCliente: dividir(gasto, clientes) });
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

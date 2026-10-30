import "server-only";

import { idsDeContasOcultas, semContasOcultas } from "@/lib/corretores/contaOculta";
import {
  resumirImpulsionamentos,
  totaisDosImpulsionamentos,
  type LeadDeAnuncio,
  type LinhaImpulsionamento,
} from "@/lib/crm/impulsionamentosCalculo";
import { ordenarCampanhas, situacaoDaCampanha } from "@/lib/crm/listaDeCampanhas";
import { lerLancamentosPagos } from "@/lib/financeiro/caixaDados";
import { lerLeadsLeves, lerMeta, lerTaxasDaEquipe, lerVendas, type Recorte, type VendaNaTela } from "@/lib/financeiro/dados";
import { desempenhoPorCorretor, type DesempenhoDoCorretor } from "@/lib/financeiro/desempenho";
import { extratoDo, repasseDoPeriodo } from "@/lib/financeiro/extrato";
import { lerFeitosDoMes, lerMetasDoMes } from "@/lib/financeiro/metasDaEquipeDados";
import { intervaloDo, mesAtual, nomeDoMes } from "@/lib/financeiro/periodo";
import { MEDIDAS, ROTULO_DA_MEDIDA } from "@/lib/financeiro/placarDaEquipe";
import { janelaDoResultado, lerMes, resultadosDoMes } from "@/lib/financeiro/resultado";
import { fraseDoRitmo, ROTULO_FONTE_COMISSAO } from "@/lib/financeiro/ritmo";
import { calcularRitmoDoCorretor } from "@/lib/financeiro/ritmoDoCorretor";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { createServiceClient } from "@/lib/supabase/service";
import { ETAPA_LABEL, ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";
import { motivoDaQueda } from "@/lib/whatsapp/motivoDaQueda";
import { quandoEmSaoPaulo } from "@/lib/whatsapp/saudeDaConexao";
import type { Acao, Consulta, ContextoDoCentral } from "../executar";

/**
 * Frente G — relatórios da onda 2: relatorio_do_corretor (12),
 * meta_e_comissao (24), relatorio_da_equipe (13, gestor), resultado_do_mes
 * (27, gestor), whatsapp_da_equipe (30, gestor). Todas CONSULTAS: leem e
 * devolvem um objeto curto, com rótulos prontos (moeda, "1 a 30/10"); o
 * cérebro escreve a resposta.
 *
 * Os números são os das telas, pela MESMA conta: `desempenhoPorCorretor`
 * (Desempenho), `calcularRitmoDoCorretor` e `extratoDo` (Extrato e meta),
 * `resultadosDoMes` (Resultado do mês), `resumirImpulsionamentos` (Anúncios
 * pagos), `leads_parados_do_corretor` (a régua da roleta e do resumo
 * semanal). As telas leem pela sessão e contam com a RLS para recortar o
 * grupo e o corretor; aqui a chave de serviço não recorta nada, então as
 * leituras passam pelos miolos que recebem o recorte (`lerVendas`,
 * `lerLeadsLeves`, `lerMeta`, `lerLancamentosPagos`…) e toda leitura direta
 * deste arquivo filtra `grupo_id`.
 *
 * O escopo vem da identificação (`ctx`), nunca dos argumentos: o relatório
 * do corretor é sempre o de quem pergunta, e as consultas de gestor
 * conferem o papel de novo (o executor já barra, mas a chave de serviço não
 * perdoa um engano). Conteúdo de conversa não entra em nenhum relatório.
 */

type Supa = ReturnType<typeof createServiceClient>;

const SO_GESTOR = { erro: "Isso é só para o gestor da imobiliária." };

// ── Período em São Paulo ─────────────────────────────────────────────────

export type PeriodoDoRelatorio = {
  /** "aaaa-mm-dd", inclusive, no calendário de São Paulo. */
  inicio: string;
  fim: string;
  /** "1 a 30/10": até hoje quando o período ainda corre. */
  rotulo: string;
  /** Meia-noite de São Paulo do início e do dia seguinte ao fim (exclusivo), para `created_at`. */
  desdeIso: string;
  ateIso: string;
  /** O texto pedido não foi entendido e valeu o padrão (este mês). */
  padrao?: true;
};

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const doisDigitos = (n: number) => String(n).padStart(2, "0");

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ultimoDiaDoMes(ano: number, mes: number): string {
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(new Date(Date.UTC(ano, mes, 0)).getUTCDate())}`;
}

function normalizar(texto: unknown): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "1 a 30/10", "27/10 a 02/11", "15/12/2025 a 05/01/2026" ou "30/10". */
function rotuloDoIntervalo(inicio: string, fim: string, hoje: string): string {
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const comAno = inicio.slice(0, 4) !== fim.slice(0, 4) || fim.slice(0, 4) !== hoje.slice(0, 4);
  const completo = (iso: string) => (comAno ? `${dm(iso)}/${iso.slice(0, 4)}` : dm(iso));
  if (inicio === fim) return completo(fim);
  if (inicio.slice(0, 7) === fim.slice(0, 7) && !comAno) return `${Number(inicio.slice(8, 10))} a ${dm(fim)}`;
  return `${completo(inicio)} a ${completo(fim)}`;
}

function periodo(inicio: string, fim: string, hoje: string, padrao = false): PeriodoDoRelatorio {
  // O rótulo para em hoje: "1 a 30/10" diz a verdade sobre o que já foi contado.
  const ateHoje = fim > hoje ? hoje : fim;
  return {
    inicio,
    fim,
    rotulo: rotuloDoIntervalo(inicio, ateHoje < inicio ? inicio : ateHoje, hoje),
    desdeIso: `${inicio}T00:00:00-03:00`,
    ateIso: `${somarDias(fim, 1)}T00:00:00-03:00`,
    ...(padrao ? { padrao: true as const } : {}),
  };
}

/**
 * O período do pedido ("este mês", "semana passada", "outubro"), no
 * calendário de São Paulo. Sem período, ou sem entender, é este mês (o
 * padrão das telas, `intervaloDo("mes")`), e o objeto diz que foi o padrão.
 * São Paulo não tem horário de verão desde 2019: meia-noite é -03:00.
 */
export function periodoDoPedido(texto: unknown, hoje: string): PeriodoDoRelatorio {
  const t = normalizar(texto);
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const esteMes = () => {
    const { inicio, fim } = intervaloDo("mes", hoje);
    return { inicio, fim };
  };
  if (!t || /^(n?esse|n?este|do|o) mes$|^mes$|^mes atual$/.test(t)) {
    const { inicio, fim } = esteMes();
    return periodo(inicio, fim, hoje);
  }
  if (/mes passado|ultimo mes|mes anterior/.test(t)) {
    const [a, m] = mes === 1 ? [ano - 1, 12] : [ano, mes - 1];
    return periodo(`${a}-${doisDigitos(m)}-01`, ultimoDiaDoMes(a, m), hoje);
  }
  // Semana de segunda a domingo, como a agenda.
  const segunda = somarDias(hoje, -((new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7));
  if (/semana passada|ultima semana|semana anterior/.test(t)) return periodo(somarDias(segunda, -7), somarDias(segunda, -1), hoje);
  if (/(n?esta|n?essa) semana|^semana$/.test(t)) return periodo(segunda, somarDias(segunda, 6), hoje);
  if (/^hoje$/.test(t)) return periodo(hoje, hoje, hoje);
  if (/^ontem$/.test(t)) return periodo(somarDias(hoje, -1), somarDias(hoje, -1), hoje);
  const ultimos = /ultimos (\d{1,3}) dias/.exec(t);
  if (ultimos) {
    const n = Math.min(366, Math.max(1, Number(ultimos[1])));
    return periodo(somarDias(hoje, -(n - 1)), hoje, hoje);
  }
  if (/trimestre/.test(t)) {
    const { inicio, fim } = intervaloDo("trimestre", hoje);
    return periodo(inicio, fim, hoje);
  }
  if (/(n?este|n?esse|do) ano|^ano$/.test(t)) {
    const { inicio, fim } = intervaloDo("ano", hoje);
    return periodo(inicio, fim, hoje);
  }
  const doMes = mesDoTexto(t, hoje);
  if (doMes) {
    const [a, m] = doMes.split("-").map(Number);
    return periodo(`${doMes}-01`, ultimoDiaDoMes(a, m), hoje);
  }
  const { inicio, fim } = esteMes();
  return periodo(inicio, fim, hoje, true);
}

/**
 * "outubro", "setembro de 2025", "09/2026" → "aaaa-mm". Mês sem ano que
 * ainda não chegou é o do ano passado ("dezembro" em outubro de 2026 é
 * dezembro de 2025): ninguém pede relatório do futuro.
 */
function mesDoTexto(t: string, hoje: string): string | null {
  const ano = Number(hoje.slice(0, 4));
  const atual = hoje.slice(0, 7);
  const numerico = /\b(\d{4})-(\d{2})\b|\b(\d{1,2})\/(\d{4})\b/.exec(t);
  if (numerico) {
    const a = Number(numerico[1] ?? numerico[4]);
    const m = Number(numerico[2] ?? numerico[3]);
    return m >= 1 && m <= 12 ? `${a}-${doisDigitos(m)}` : null;
  }
  const i = MESES.findIndex((nome) => new RegExp(`\\b${nome}\\b`).test(t));
  if (i < 0) return null;
  const anoDito = /\b(20\d{2})\b/.exec(t);
  const candidato = `${anoDito ? Number(anoDito[1]) : ano}-${doisDigitos(i + 1)}`;
  return !anoDito && candidato > atual ? `${ano - 1}-${doisDigitos(i + 1)}` : candidato;
}

// ── Utilidades do objeto de resposta ─────────────────────────────────────

const pct = (n: number | null) => (n === null ? null : `${Math.round(n * 100)}%`);

/** Tira as chaves vazias: "distratos: null" ensina o modelo a falar do que não existe. */
function semVazios<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;

const VAZIO = (corretorId: string): DesempenhoDoCorretor => ({
  corretorId,
  atendidos: 0,
  visitas: 0,
  vendas: 0,
  distratos: 0,
  vgv: 0,
  leadParaVisita: null,
  visitaParaVenda: null,
  leadParaVenda: null,
  diasAteVenda: null,
  porImovel: [],
});

/** Os nomes dos imóveis que o desempenho cita, lidos no grupo. */
async function nomesDosImoveis(supabase: Supa, grupoId: string, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await supabase.from("empreendimentos").select("id, nome").eq("grupo_id", grupoId).in("id", ids);
  return new Map((data ?? []).map((e) => [e.id, e.nome]));
}

/**
 * O desempenho do período, pela conta da tela Desempenho
 * (`desempenhoPorCorretor`): leads que chegaram no período (dono = quem
 * atendeu), quantos deles chegaram à visita, e as vendas com data no
 * período. A tela lê o período pela data em UTC (`created_at >= "aaaa-mm-dd"`);
 * aqui o período é o de São Paulo, de meia-noite a meia-noite: lead das 21h
 * às 24h do último dia do mês conta no mês em que o corretor o recebeu.
 */
async function desempenhoDoPeriodo(
  supabase: Supa,
  recorte: Recorte,
  p: PeriodoDoRelatorio,
): Promise<{ desempenho: Map<string, DesempenhoDoCorretor>; semVendas: boolean }> {
  const [leads, leitura] = await Promise.all([
    lerLeadsLeves(supabase, p.desdeIso, { ...recorte, ate: p.ateIso }),
    lerVendas(supabase, { inicio: p.inicio, fim: p.fim }, recorte),
  ]);
  const vendas = leitura.ok ? leitura.vendas : [];
  const ids = [
    ...new Set([
      ...leads.map((l) => l.imovelId),
      ...vendas.map((v) => v.empreendimentoId),
    ].filter((id): id is string => Boolean(id))),
  ];
  const nomeDoImovel = await nomesDosImoveis(supabase, recorte.grupoId, ids);
  return { desempenho: desempenhoPorCorretor({ leads, vendas, nomeDoImovel }), semVendas: !leitura.ok };
}

// ── relatorio_do_corretor (capacidade 12) ────────────────────────────────

/** "Novo" em vez de "Leads" (o rótulo da coluna): aqui é contagem da carteira. */
const rotuloDaEtapa = (e: EtapaFunil) => (e === "novo" ? "Novo" : ETAPA_LABEL[e]);

/**
 * A carteira de hoje por etapa, como o funil do Início (`getContagemPorEtapa`
 * com o dono): leads não arquivados de quem pergunta, uma contagem por etapa.
 */
async function funilDeHoje(supabase: Supa, ctx: ContextoDoCentral): Promise<{ etapa: string; leads: number }[]> {
  const pares = await Promise.all(
    ETAPAS_FUNIL.map(async (etapa) => {
      const { count, data, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("grupo_id", ctx.grupoId)
        .eq("corretor_id", ctx.corretorId)
        .is("arquivado_em", null)
        .eq("etapa", etapa);
      if (error) throw new Error(`Falha ao contar o funil: ${error.message}`);
      // `head: true` devolve só `count`; sem ele (o banco de teste), as linhas.
      return { etapa: rotuloDaEtapa(etapa), leads: count ?? (Array.isArray(data) ? data.length : 0) };
    }),
  );
  return pares.filter((p) => p.leads > 0);
}

/**
 * "Como foi meu mês?": leads novos, visitas, vendas e o funil, de QUEM
 * pergunta (também o gestor: é o relatório dele; o da equipe é outra
 * ferramenta). Leads e vendas do período; o funil é a carteira de hoje.
 */
export async function relatorioDoCorretor(
  ctx: ContextoDoCentral,
  argumentos: Record<string, unknown>,
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<unknown> {
  const hoje = hojeEmSaoPaulo(agora);
  const p = periodoDoPedido(argumentos.periodo, hoje);
  const recorte: Recorte = { grupoId: ctx.grupoId, corretorId: ctx.corretorId };
  const [{ desempenho, semVendas }, funil] = await Promise.all([desempenhoDoPeriodo(supabase, recorte, p), funilDeHoje(supabase, ctx)]);
  const d = desempenho.get(ctx.corretorId) ?? VAZIO(ctx.corretorId);

  return semVazios({
    periodo: p.rotulo,
    aviso: p.padrao ? "Não entendi o período pedido; usei este mês." : null,
    leadsNovos: d.atendidos,
    viraramVisita: d.visitas,
    vendas: d.vendas,
    distratos: d.distratos || null,
    vgv: d.vendas ? formatarReais(d.vgv) : null,
    conversao: semVazios({
      leadParaVisita: pct(d.leadParaVisita),
      visitaParaVenda: pct(d.visitaParaVenda),
    }),
    imoveisDeReferencia: d.porImovel.slice(0, 3).map((l) =>
      semVazios({ imovel: l.imovel, leads: l.atendidos || null, visitas: l.visitas || null, vendas: l.vendas || null }),
    ),
    funilHoje: funil,
    comoContar:
      "Leads novos são os que chegaram no período; 'viraram visita' são esses mesmos que já marcaram ou fizeram visita; vendas pela data da venda. O funil é a carteira de hoje.",
    semVendas: semVendas ? "O registro de vendas não pôde ser lido agora; vendas ficaram fora." : null,
  });
}

// ── meta_e_comissao (capacidade 24) ──────────────────────────────────────

/**
 * "Quanto falta pra minha meta?" e "quanto tenho a receber?": o cartão da
 * meta e o topo do Extrato (`getRitmoDoCorretor` + `extratoDo`), pela mesma
 * conta (`calcularRitmoDoCorretor`), e as metas de visitas, propostas e
 * vendas que o gestor definiu (placar da 0246).
 *
 * As vendas são as que a tela leria: o gestor vê as do grupo, o corretor as
 * que registrou e as em que participa (`lerVendas` com o recorte). Comissão
 * é privada: só a de quem pergunta sai daqui.
 */
export async function metaEComissao(
  ctx: ContextoDoCentral,
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<unknown> {
  const hoje = hojeEmSaoPaulo(agora);
  const mes = mesAtual(hoje);
  const recorte: Recorte = ctx.papel === "gestor" ? { grupoId: ctx.grupoId } : { grupoId: ctx.grupoId, corretorId: ctx.corretorId };
  const leitura = await lerVendas(supabase, {}, recorte);
  if (!leitura.ok) {
    return {
      erro:
        leitura.motivo === "sem_tabela"
          ? "O registro de vendas ainda não está ativo nesta imobiliária."
          : "Não consegui ler as vendas agora.",
    };
  }
  const vendas = leitura.vendas;

  const [ritmo, metasDoGestor] = await Promise.all([
    calcularRitmoDoCorretor(
      {
        meta: (corretorId, m) => lerMeta(supabase, corretorId, m, ctx.grupoId),
        leadsLeves: (desde) => lerLeadsLeves(supabase, desde, { grupoId: ctx.grupoId, corretorId: ctx.corretorId }),
        taxasDaEquipe: (desde) => lerTaxasDaEquipe(supabase, ctx.grupoId, desde),
      },
      ctx.corretorId,
      vendas,
      hoje,
    ),
    metasDoMes(ctx, mes, vendas, agora),
  ]);
  const extrato = extratoDo(ctx.corretorId, vendas, hoje);
  const { inicio, fim } = intervaloDo("mes", hoje);

  const meta =
    ritmo.estado === "ok"
      ? semVazios({
          mes: `${nomeDoMes(mes)} (${rotuloDoIntervalo(inicio, hoje, hoje)})`,
          meta: formatarReais(ritmo.ritmo.meta),
          ganhoNoMes: formatarReais(ritmo.ritmo.ganho),
          falta: formatarReais(ritmo.ritmo.falta),
          progresso: `${Math.round(ritmo.ritmo.progresso * 100)}%`,
          oQueFalta: fraseDoRitmo(ritmo.ritmo),
          comissaoPorVenda: ritmo.ritmo.comissaoPorVenda
            ? `${formatarReais(ritmo.ritmo.comissaoPorVenda.valor)} (${ROTULO_FONTE_COMISSAO[ritmo.ritmo.comissaoPorVenda.fonte]})`
            : null,
          diasRestantes: ritmo.ritmo.diasRestantes,
        })
      : ritmo.estado === "sem_meta"
        ? {
            semMeta: "Você ainda não definiu a meta de comissão deste mês. Dá para definir em Financeiro → Extrato e meta.",
            ganhoNoMes: formatarReais(repasseDoPeriodo(ctx.corretorId, vendas, inicio, fim)),
          }
        : null;

  return semVazios({
    meta,
    metasDoGestor,
    comissao: semVazios({
      aReceber: formatarReais(extrato.aReceber),
      jaLiberado: extrato.liberado > 0 ? `${formatarReais(extrato.liberado)} (a construtora já pagou; pode sair agora)` : null,
      recebidoNoAno: formatarReais(extrato.recebidoNoAno),
      vendasComComissaoPendente: extrato.linhas.filter((l) => ["pode_pagar", "parcial", "aguardando_construtora"].includes(l.situacao)).length || null,
    }),
  });
}

/**
 * As metas de visitas, propostas e vendas do mês que o gestor deu a quem
 * pergunta (0246), com o feito pela régua do placar (`lerFeitosDoMes`). A
 * venda é a do ranking de VGV: participação em venda ativa com data no mês.
 * `null` sem meta (ou sem a 0246): meta que ninguém definiu não é de ninguém.
 */
async function metasDoMes(
  ctx: ContextoDoCentral,
  mes: string,
  vendas: VendaNaTela[],
  agora: Date,
): Promise<{ medida: string; meta: number; feito: number; falta: number }[] | null> {
  try {
    const metas = await lerMetasDoMes(ctx.grupoId, mes);
    const minhas = metas?.get(ctx.corretorId);
    if (!minhas || MEDIDAS.every((m) => minhas[m] === null)) return null;
    const fim = intervaloDo("mes", mes).fim;
    const vendasNoMes = vendas.filter(
      (v) => v.status === "ativa" && v.dataVenda >= mes && v.dataVenda <= fim && v.participantes.some((p) => p.corretorId === ctx.corretorId),
    ).length;
    const feitos = await lerFeitosDoMes(ctx.grupoId, mes, new Map([[ctx.corretorId, vendasNoMes]]), agora);
    const feito = feitos.get(ctx.corretorId) ?? { visitas: 0, propostas: 0, vendas: 0 };
    return MEDIDAS.filter((m) => minhas[m] !== null).map((m) => ({
      medida: ROTULO_DA_MEDIDA[m].plural,
      meta: minhas[m]!,
      feito: feito[m],
      falta: Math.max(0, minhas[m]! - feito[m]),
    }));
  } catch {
    // É acessório: sem o placar, a meta de comissão e o extrato respondem.
    return null;
  }
}

// ── relatorio_da_equipe (capacidade 13, gestor) ──────────────────────────

/** Quantos corretores o ranking leva: a equipe de hoje cabe, e a resposta segue curta. */
const TETO_DO_RANKING = 10;
const TETO_DE_CAMPANHAS = 5;

/**
 * "Como está a equipe?": o ranking do período pela conta do Desempenho
 * (VGV, depois vendas, depois leads), quem tem lead parado (a régua da
 * roleta, `leads_parados_do_corretor`) e as campanhas de Anúncios pagos.
 *
 * Conta oculta (0189) fica fora de tudo, como nas telas. Nada de conversa:
 * o parado sai de uma contagem do banco, e a campanha não conta mensagens
 * (a tela conta falas do cliente para o degrau "conversou"; o relatório não
 * usa esse degrau).
 */
export async function relatorioDaEquipe(
  ctx: ContextoDoCentral,
  argumentos: Record<string, unknown>,
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<unknown> {
  if (ctx.papel !== "gestor") return SO_GESTOR;
  const hoje = hojeEmSaoPaulo(agora);
  const p = periodoDoPedido(argumentos.periodo, hoje);

  const [ocultas, { data: pessoas }] = await Promise.all([
    idsDeContasOcultas(supabase, ctx.grupoId),
    supabase.from("corretores").select("id, nome, ativo, slug").eq("grupo_id", ctx.grupoId),
  ]);
  // A equipe da tela (`getEquipeAtiva`): ativos, com página, sem conta oculta.
  const equipe = (pessoas ?? []).filter((c) => c.ativo && c.slug !== null && !ocultas.has(c.id));
  const nomes = new Map((pessoas ?? []).map((c) => [c.id, c.nome as string]));

  const [{ desempenho, semVendas }, parados, campanhas] = await Promise.all([
    desempenhoDoPeriodo(supabase, { grupoId: ctx.grupoId }, p),
    leadsParados(supabase, equipe),
    campanhasPagas(supabase, ctx, ocultas, hoje),
  ]);
  for (const id of ocultas) desempenho.delete(id);

  const ranking = [...new Set([...equipe.map((c) => c.id), ...desempenho.keys()])]
    .map((id) => desempenho.get(id) ?? VAZIO(id))
    .sort((a, b) => b.vgv - a.vgv || b.vendas - a.vendas || b.atendidos - a.atendidos)
    .slice(0, TETO_DO_RANKING)
    .map((d, i) =>
      semVazios({
        posicao: i + 1,
        corretor: nomes.get(d.corretorId) ?? "Corretor",
        leadsNovos: d.atendidos,
        viraramVisita: d.visitas,
        vendas: d.vendas,
        vgv: d.vendas ? formatarReais(d.vgv) : null,
      }),
    );

  return semVazios({
    periodo: p.rotulo,
    aviso: p.padrao ? "Não entendi o período pedido; usei este mês." : null,
    ranking,
    parados: parados === null ? null : parados.length ? parados : "Ninguém com lead parado agora.",
    regraDoParado: parados?.length
      ? "Lead parado: chegou há mais de 48 h (e menos de 30 dias), ainda no caminho, e ninguém (corretor nem IA) falou com ele nas últimas 48 h."
      : null,
    campanhas,
    semVendas: semVendas ? "O registro de vendas não pôde ser lido agora; vendas ficaram fora do ranking." : null,
  });
}

/**
 * Quem da equipe tem lead parado, pela função do banco que a roleta e o
 * resumo semanal usam (0246, liberada para a chave de serviço). `null` sem
 * a 0246: a linha some, o resto do relatório sai.
 */
async function leadsParados(
  supabase: Supa,
  equipe: readonly { id: string; nome: string }[],
): Promise<{ corretor: string; leadsParados: number }[] | null> {
  let falhou = false;
  const contagens = await Promise.all(
    equipe.map(async (c) => {
      const { data, error } = await supabase.rpc("leads_parados_do_corretor", { p_corretor: c.id });
      if (error) falhou = true;
      return { corretor: primeiroNome(c.nome), leadsParados: Number(data ?? 0) };
    }),
  );
  if (falhou) return null;
  return contagens
    .filter((c) => c.leadsParados > 0)
    .sort((a, b) => b.leadsParados - a.leadsParados || a.corretor.localeCompare(b.corretor, "pt-BR"));
}

/**
 * As campanhas da tela Anúncios pagos (`resumirImpulsionamentos`, a mesma
 * conta da lista), as que mais trouxeram clientes primeiro, e os totais do
 * topo da tela (`totaisDosImpulsionamentos`: custo só sobre as campanhas com
 * gasto informado). Como a lista da tela, desde o início de cada campanha.
 */
async function campanhasPagas(supabase: Supa, ctx: ContextoDoCentral, ocultas: ReadonlySet<string>, hoje: string) {
  const [{ data: linhas, error }, { data: leads }, { data: imoveis }] = await Promise.all([
    supabase
      .from("impulsionamentos")
      .select(
        "id, corretor_id, chave, titulo, url, empreendimento_id, valor_gasto, primeiro_lead_em, ultimo_lead_em, criada_pelo_corretor, canal, inicio, fim, agrupado_em",
      )
      .eq("grupo_id", ctx.grupoId)
      .order("ultimo_lead_em", { ascending: false })
      .limit(200),
    supabase
      .from("leads")
      .select("id, corretor_id, meta_ad_id, anuncio_origem, etapa, visita_agendada_em, impulsionamento_id, created_at, renda_mensal, orcamento_min, orcamento_max, nao_contatar_em")
      .eq("grupo_id", ctx.grupoId)
      .or("origem.eq.meta/ctwa,impulsionamento_id.not.is.null")
      .is("arquivado_em", null)
      .limit(5000),
    supabase.from("empreendimentos").select("id, nome, nomes_alternativos").eq("grupo_id", ctx.grupoId),
  ]);
  if (error || !linhas || linhas.length === 0) return null;

  // A conta oculta do próprio gestor continua dele, como na tela.
  const fora = new Set([...ocultas].filter((id) => id !== ctx.corretorId));
  const doBanco: LinhaImpulsionamento[] = semContasOcultas(linhas, fora, (l) => l.corretor_id).map((l) => ({
    id: l.id,
    corretorId: l.corretor_id,
    chave: l.chave,
    titulo: l.titulo,
    url: l.url,
    empreendimentoId: l.empreendimento_id,
    valorGasto: l.valor_gasto === null ? null : Number(l.valor_gasto),
    primeiroLeadEm: l.primeiro_lead_em,
    ultimoLeadEm: l.ultimo_lead_em,
    criadaPeloCorretor: l.criada_pelo_corretor,
    canal: l.canal,
    inicio: l.inicio,
    fim: l.fim,
    agrupadoEm: l.agrupado_em,
  }));
  const leadsDeAnuncio: LeadDeAnuncio[] = semContasOcultas(leads ?? [], fora, (l) => l.corretor_id).map((l) => ({
    id: l.id,
    corretorId: l.corretor_id,
    metaAdId: l.meta_ad_id,
    anuncioOrigem: l.anuncio_origem,
    etapa: l.etapa,
    visitaAgendadaEm: l.visita_agendada_em,
    impulsionamentoId: l.impulsionamento_id,
    criadoEm: l.created_at,
    capacidadeDita: l.renda_mensal !== null || l.orcamento_min !== null || l.orcamento_max !== null,
    pediuParaSair: l.nao_contatar_em !== null,
  }));
  const nomesDoImovel = Object.fromEntries(
    (imoveis ?? []).map((i) => [i.id, [i.nome as string, ...((i.nomes_alternativos as string[] | null) ?? [])]]),
  );
  const resumos = resumirImpulsionamentos(doBanco, leadsDeAnuncio, nomesDoImovel);
  if (resumos.length === 0) return null;
  const totais = totaisDosImpulsionamentos(resumos);

  return semVazios({
    noAr: resumos.filter((r) => situacaoDaCampanha(r, hoje) === "no_ar").length,
    maisClientes: ordenarCampanhas(resumos, "clientes", [])
      .slice(0, TETO_DE_CAMPANHAS)
      .map((r) =>
        semVazios({
          campanha: r.titulo ?? (r.criadaPeloCorretor ? "Campanha sem nome" : "Post impulsionado"),
          situacao: situacaoDaCampanha(r, hoje) === "no_ar" ? "no ar" : "encerrada",
          clientes: r.leads,
          visitas: r.visitas || null,
          fechados: r.fechados || null,
          gasto: r.gastoTotal === null ? "sem valor informado" : formatarReais(r.gastoTotal),
          custoPorCliente: r.custoPorLead === null ? null : formatarReais(r.custoPorLead),
        }),
      ),
    totalGasto: totais.gasto > 0 ? formatarReais(totais.gasto) : null,
    custoPorCliente: totais.custoPorLead === null ? null : formatarReais(totais.custoPorLead),
    semGastoInformado: totais.semGasto || null,
  });
}

// ── resultado_do_mes (capacidade 27, gestor) ─────────────────────────────

/**
 * "Como fechou o mês?": a DRE da tela Resultado do mês, pela mesma conta
 * (`resultadosDoMes` sobre `lerLancamentosPagos` + as vendas do grupo, que é
 * o que o gestor lê na tela). Regime de caixa: o que de fato entrou e saiu.
 */
export async function resultadoDoMesDaImobiliaria(
  ctx: ContextoDoCentral,
  argumentos: Record<string, unknown>,
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<unknown> {
  if (ctx.papel !== "gestor") return SO_GESTOR;
  const hoje = hojeEmSaoPaulo(agora);
  const pedido = normalizar(argumentos.mes);
  const entendido = !pedido || /(n?este|n?esse|do) mes|^mes$/.test(pedido)
    ? hoje.slice(0, 7)
    : /mes passado|ultimo mes|mes anterior/.test(pedido)
      ? periodoDoPedido("mes passado", hoje).inicio.slice(0, 7)
      : mesDoTexto(pedido, hoje);
  // A régua da tela (`lerMes`): mês inválido ou futuro vira o atual.
  const mes = lerMes(entendido ?? undefined, hoje);
  const { desde, ate } = janelaDoResultado(mes);

  const [leitura, leituraVendas] = await Promise.all([
    lerLancamentosPagos(supabase, desde, ate, ctx.grupoId),
    lerVendas(supabase, {}, { grupoId: ctx.grupoId }),
  ]);
  if (!leitura.ok) {
    return {
      erro: leitura.motivo === "sem_tabela" ? "O caixa ainda não está ativo nesta imobiliária." : "Não consegui ler o caixa agora.",
    };
  }
  const { doMes, anterior } = resultadosDoMes(leitura.lancamentos, leituraVendas.ok ? leituraVendas.vendas : [], mes);
  const [a, m] = mes.split("-").map(Number);
  const rotulo = `${nomeDoMes(`${mes}-01`)} de ${a} (${periodo(`${mes}-01`, ultimoDiaDoMes(a, m), hoje).rotulo})`;
  const reais = (n: number) => (n ? formatarReais(n) : null);

  return semVazios({
    mes: rotulo,
    aviso: pedido && !entendido ? "Não entendi o mês pedido; usei o mês atual." : null,
    situacao: !doMes.temMovimento
      ? "Nada foi pago nem recebido neste mês."
      : mes === hoje.slice(0, 7)
        ? "O mês ainda está correndo: o número muda conforme contas são pagas e comissões entram."
        : null,
    receitaDeCorretagem: formatarReais(doMes.receitaCorretagem),
    comissoesDasConstrutoras: reais(doMes.comissoes),
    comissaoAvulsa: reais(doMes.comissaoAvulsa),
    repassesAosCorretores: reais(doMes.repasses),
    impostos: reais(doMes.impostos),
    outrasReceitas: reais(doMes.outrasReceitas),
    despesas: formatarReais(doMes.totalDespesas),
    maioresDespesas: doMes.despesas.slice(0, 4).map((d) => `${d.rotulo}: ${formatarReais(d.valor)}`),
    resultado: formatarReais(doMes.resultado),
    margem: pct(doMes.margem),
    mesAnterior: anterior.temMovimento ? formatarReais(anterior.resultado) : null,
    regime: "Regime de caixa: conta o que foi de fato pago e recebido no mês.",
    semVendas: leituraVendas.ok ? null : "As vendas não puderam ser lidas agora; comissões e repasses ficaram fora.",
  });
}

// ── whatsapp_da_equipe (capacidade 30, gestor) ───────────────────────────

/**
 * "Quem está com o WhatsApp desconectado?": o estado de cada número da
 * equipe, pela régua da tela WhatsApp da equipe (desconectado, parou de
 * enviar com a sessão caída, bloqueado), mais quem nunca conectou. Só status:
 * nada de conversa (0134). Conta oculta e quem foi desativado ficam fora.
 *
 * O desenho (3.7, item 30) quer que o central mande a cada um o passo para
 * reconectar. Isso é ENVIO: fica para uma ação com proposta e "sim"
 * (`avisarPeloCentral`), não para esta consulta.
 */
export async function whatsappDaEquipe(
  ctx: ContextoDoCentral,
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<unknown> {
  if (ctx.papel !== "gestor") return SO_GESTOR;
  const [ocultas, { data: pessoas }, { data: instancias }] = await Promise.all([
    idsDeContasOcultas(supabase, ctx.grupoId),
    supabase.from("corretores").select("id, nome, ativo").eq("grupo_id", ctx.grupoId),
    supabase
      .from("corretor_whatsapp_instancias")
      .select("corretor_id, status_conexao, conectado_em, bloqueado_ate, desconectado_em, motivo_queda_codigo, sessao_caida_em")
      .eq("grupo_id", ctx.grupoId),
  ]);
  const equipe = semContasOcultas((pessoas ?? []).filter((c) => c.ativo), ocultas);
  const daEquipe = new Map(equipe.map((c) => [c.id, c.nome as string]));
  const numeros = (instancias ?? []).filter((i) => daEquipe.has(i.corretor_id));

  const desconectados: { corretor: string; desde?: string; motivo?: string; passo: string }[] = [];
  const pararamDeEnviar: { corretor: string; passo: string }[] = [];
  const bloqueados: { corretor: string; ate: string }[] = [];
  let conectados = 0;
  for (const i of numeros) {
    const nome = daEquipe.get(i.corretor_id)!;
    const conectado = i.status_conexao === "conectado" && i.conectado_em !== null;
    // "Conectado" no banco com a sessão caída não recebe nada (0174).
    const sessaoCaida = conectado && i.sessao_caida_em !== null;
    const bloqueado = i.bloqueado_ate !== null && new Date(i.bloqueado_ate) > agora;
    if (!conectado) {
      desconectados.push(
        semVazios({
          corretor: nome,
          desde: i.desconectado_em ? quandoEmSaoPaulo(new Date(i.desconectado_em)) : undefined,
          motivo: motivoDaQueda(i.motivo_queda_codigo) ?? undefined,
          passo: "conectar de novo em WhatsApp → Conexão, com o celular na mão (QR ou código)",
        }) as { corretor: string; passo: string },
      );
    } else if (sessaoCaida) {
      pararamDeEnviar.push({ corretor: nome, passo: "desconectar e conectar de novo em WhatsApp → Conexão" });
    } else {
      conectados++;
    }
    if (bloqueado) bloqueados.push({ corretor: nome, ate: quandoEmSaoPaulo(new Date(i.bloqueado_ate!)) });
  }
  const comNumero = new Set(numeros.map((i) => i.corretor_id));
  const nuncaConectaram = equipe.filter((c) => !comNumero.has(c.id)).map((c) => c.nome as string);

  return semVazios({
    equipe: equipe.length,
    conectados,
    desconectados,
    pararamDeEnviar,
    bloqueados,
    nuncaConectaram,
    tudoCerto: desconectados.length + pararamDeEnviar.length === 0 ? "Todos os números conectados estão funcionando." : null,
    // O envio do passo pelo central ainda não existe: o cérebro não promete.
    avisarCadaUm: desconectados.length + pararamDeEnviar.length > 0 ? "Mandar o passo a cada um pelo central ainda não está disponível." : null,
  });
}

export const CONSULTAS_RELATORIOS: Record<string, Consulta> = {
  relatorio_do_corretor: (ctx, argumentos) => relatorioDoCorretor(ctx, argumentos),
  meta_e_comissao: (ctx) => metaEComissao(ctx),
  relatorio_da_equipe: (ctx, argumentos) => relatorioDaEquipe(ctx, argumentos),
  resultado_do_mes: (ctx, argumentos) => resultadoDoMesDaImobiliaria(ctx, argumentos),
  whatsapp_da_equipe: (ctx) => whatsappDaEquipe(ctx),
};
export const ACOES_RELATORIOS: Record<string, Acao> = {};

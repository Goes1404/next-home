import { centavos, vgvCreditado, type StatusVenda } from "./venda";
import { diasEntre } from "./periodo";

/**
 * O desempenho do corretor por imóvel (F4 do financeiro), e o que separa
 * quem converte de quem não converte (F8).
 *
 * Tudo puro, a partir do que o banco já tem: `leads` diz quem ATENDEU
 * (dono do lead) e em que imóvel (`imovel_interesse_id`, o assunto da
 * conversa, e na falta dele `empreendimento_id`, a origem); a visita é o
 * FATO `visita_agendada_em` ou a etapa já passada por ela; a venda é a
 * participação em `venda_participantes`. Nada é pedido ao corretor além da
 * venda que ele já registra.
 */

export type LeadDoDesempenho = {
  id: string;
  corretorId: string | null;
  imovelId: string | null;
  criadoEm: string; // aaaa-mm-dd
  visitou: boolean;
};

export type VendaDoDesempenho = {
  id: string;
  leadId: string | null;
  empreendimentoId: string | null;
  imovel: string;
  dataVenda: string;
  valorVenda: number;
  status: StatusVenda;
  participantes: { corretorId: string; partePercentual: number }[];
};

export type LinhaPorImovel = {
  imovelId: string;
  imovel: string;
  atendidos: number;
  visitas: number;
  vendas: number;
  vgv: number;
};

export type DesempenhoDoCorretor = {
  corretorId: string;
  atendidos: number;
  visitas: number;
  vendas: number;
  distratos: number;
  vgv: number;
  /** Frações 0-1, `null` quando o denominador é zero. */
  leadParaVisita: number | null;
  visitaParaVenda: number | null;
  leadParaVenda: number | null;
  /** Mediana de dias entre o lead chegar e a venda, só vendas ligadas a lead. */
  diasAteVenda: number | null;
  porImovel: LinhaPorImovel[];
  /** O imóvel em que ele é referência, quando há base para dizer. */
  especialidade: LinhaPorImovel | null;
};

const fracao = (a: number, b: number) => (b > 0 ? a / b : null);

export function mediana(ns: number[]): number | null {
  if (ns.length === 0) return null;
  const o = [...ns].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/** Peso de cada degrau para decidir em que imóvel ele é referência. */
const pontos = (l: LinhaPorImovel) => l.vendas * 10 + l.visitas * 3 + l.atendidos;

export function desempenhoPorCorretor(params: {
  leads: LeadDoDesempenho[];
  vendas: VendaDoDesempenho[];
  nomeDoImovel: Map<string, string>;
}): Map<string, DesempenhoDoCorretor> {
  const res = new Map<string, DesempenhoDoCorretor>();
  const criadoDoLead = new Map(params.leads.map((l) => [l.id, l.criadoEm]));
  const porImovel = new Map<string, Map<string, LinhaPorImovel>>();

  const de = (corretorId: string): DesempenhoDoCorretor => {
    let d = res.get(corretorId);
    if (!d) {
      d = {
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
        especialidade: null,
      };
      res.set(corretorId, d);
      porImovel.set(corretorId, new Map());
    }
    return d;
  };
  const linha = (corretorId: string, imovelId: string, nome: string): LinhaPorImovel => {
    de(corretorId);
    const mapa = porImovel.get(corretorId)!;
    let l = mapa.get(imovelId);
    if (!l) {
      l = { imovelId, imovel: nome, atendidos: 0, visitas: 0, vendas: 0, vgv: 0 };
      mapa.set(imovelId, l);
    }
    return l;
  };

  for (const lead of params.leads) {
    if (!lead.corretorId) continue;
    const d = de(lead.corretorId);
    d.atendidos++;
    if (lead.visitou) d.visitas++;
    if (lead.imovelId) {
      const l = linha(lead.corretorId, lead.imovelId, params.nomeDoImovel.get(lead.imovelId) ?? "Imóvel");
      l.atendidos++;
      if (lead.visitou) l.visitas++;
    }
  }

  const diasPorCorretor = new Map<string, number[]>();
  for (const v of params.vendas) {
    for (const p of v.participantes) {
      const d = de(p.corretorId);
      if (v.status === "distratada") {
        d.distratos++;
        continue;
      }
      d.vendas++;
      const vgv = vgvCreditado(v, p.partePercentual);
      d.vgv = centavos(d.vgv + vgv);
      if (v.empreendimentoId) {
        const l = linha(p.corretorId, v.empreendimentoId, params.nomeDoImovel.get(v.empreendimentoId) ?? v.imovel);
        l.vendas++;
        l.vgv = centavos(l.vgv + vgv);
      }
      const criado = v.leadId ? criadoDoLead.get(v.leadId) : undefined;
      if (criado) {
        const lista = diasPorCorretor.get(p.corretorId) ?? [];
        lista.push(Math.max(0, diasEntre(criado, v.dataVenda)));
        diasPorCorretor.set(p.corretorId, lista);
      }
    }
  }

  for (const d of res.values()) {
    d.leadParaVisita = fracao(d.visitas, d.atendidos);
    d.visitaParaVenda = fracao(d.vendas, d.visitas);
    d.leadParaVenda = fracao(d.vendas, d.atendidos);
    d.diasAteVenda = mediana(diasPorCorretor.get(d.corretorId) ?? []);
    d.porImovel = [...(porImovel.get(d.corretorId)?.values() ?? [])].sort((a, b) => pontos(b) - pontos(a));
    const topo = d.porImovel[0];
    // Referência pede fato: uma venda, ou três atendimentos do mesmo imóvel.
    d.especialidade = topo && (topo.vendas >= 1 || topo.atendidos >= 3) ? topo : null;
  }
  return res;
}

/** Quem é referência em cada imóvel: o corretor com mais pontos nele. */
export function especialistasPorImovel(
  desempenho: Map<string, DesempenhoDoCorretor>,
): Map<string, { corretorId: string; linha: LinhaPorImovel }> {
  const melhor = new Map<string, { corretorId: string; linha: LinhaPorImovel }>();
  for (const d of desempenho.values()) {
    for (const l of d.porImovel) {
      if (l.vendas < 1 && l.atendidos < 3) continue;
      const atual = melhor.get(l.imovelId);
      if (!atual || pontos(l) > pontos(atual.linha)) melhor.set(l.imovelId, { corretorId: d.corretorId, linha: l });
    }
  }
  return melhor;
}

// ─── F8: o que os melhores fazem ────────────────────────────────────────

export type PrimeiraResposta = {
  corretorId: string;
  primeiraFalaCliente: string;
  primeiraRespostaCorretor: string | null;
  primeiraRespostaIa: string | null;
};

export type TempoDeResposta = {
  corretorId: string;
  conversas: number;
  /** Mediana, em minutos, da primeira resposta de QUALQUER lado (corretor ou IA). */
  medianaMin: number | null;
  /** Das conversas, quantas ficaram sem resposta nenhuma. */
  semResposta: number;
};

const minutos = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;

export function tempoDeRespostaPorCorretor(linhas: PrimeiraResposta[]): Map<string, TempoDeResposta> {
  const acc = new Map<string, { tempos: number[]; conversas: number; sem: number }>();
  for (const l of linhas) {
    const a = acc.get(l.corretorId) ?? { tempos: [], conversas: 0, sem: 0 };
    a.conversas++;
    const respostas = [l.primeiraRespostaCorretor, l.primeiraRespostaIa].filter((x): x is string => Boolean(x));
    if (respostas.length === 0) a.sem++;
    else a.tempos.push(Math.max(0, Math.min(...respostas.map((r) => minutos(l.primeiraFalaCliente, r)))));
    acc.set(l.corretorId, a);
  }
  const res = new Map<string, TempoDeResposta>();
  for (const [corretorId, a] of acc) {
    res.set(corretorId, { corretorId, conversas: a.conversas, medianaMin: mediana(a.tempos), semResposta: a.sem });
  }
  return res;
}

/** Amostras mínimas para a comparação entre corretores não virar anedota. */
export const MINIMO_PARA_COMPARAR = { conversas: 5, atendidos: 10, corretores: 2 } as const;

/**
 * A frase que o gestor lê: o que o corretor que mais converte faz diferente
 * na velocidade de resposta. Devolve `null` quando a amostra não sustenta a
 * comparação — dois corretores com três conversas cada não dizem nada, e
 * uma frase segura sobre eles ensinaria o gestor a cobrar a coisa errada.
 */
export function oQueOsMelhoresFazem(params: {
  desempenho: Map<string, DesempenhoDoCorretor>;
  tempos: Map<string, TempoDeResposta>;
  nomes: Map<string, string>;
}): string | null {
  const elegiveis = [...params.desempenho.values()].filter((d) => {
    const t = params.tempos.get(d.corretorId);
    return (
      d.atendidos >= MINIMO_PARA_COMPARAR.atendidos &&
      d.leadParaVisita !== null &&
      t && t.conversas >= MINIMO_PARA_COMPARAR.conversas && t.medianaMin !== null
    );
  });
  if (elegiveis.length < MINIMO_PARA_COMPARAR.corretores) return null;

  const porConversao = [...elegiveis].sort((a, b) => (b.leadParaVisita ?? 0) - (a.leadParaVisita ?? 0));
  const melhor = porConversao[0];
  const tempoMelhor = params.tempos.get(melhor.corretorId)!.medianaMin!;
  const outros = porConversao.slice(1).map((d) => params.tempos.get(d.corretorId)!.medianaMin!);
  const tempoOutros = mediana(outros)!;
  const nome = params.nomes.get(melhor.corretorId) ?? "O corretor que mais converte";
  const pct = Math.round((melhor.leadParaVisita ?? 0) * 100);

  if (tempoMelhor < tempoOutros * 0.7) {
    return `${nome} leva ${formatarMinutos(tempoMelhor)} para responder o primeiro contato, contra ${formatarMinutos(tempoOutros)} do resto da equipe, e é quem mais leva lead até a visita (${pct}%). Velocidade de resposta é o primeiro ponto a cobrar.`;
  }
  return `${nome} é quem mais leva lead até a visita (${pct}%), e responde no mesmo ritmo da equipe (${formatarMinutos(tempoMelhor)}). A diferença está na conversa, não na velocidade: vale ler os atendimentos dele.`;
}

export function formatarMinutos(min: number): string {
  if (min < 1) return "menos de 1 minuto";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h * 10) / 10} h`.replace(".", ",");
  return `${Math.round(h / 24)} dias`;
}

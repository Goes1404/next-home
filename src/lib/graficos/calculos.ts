/**
 * As contas dos gráficos do painel (28/09/2026). Módulo PURO: as telas
 * buscam as linhas e passam para cá, e os testes passam objetos.
 *
 * Régua de todos eles: cada gráfico responde a UMA pergunta que leva a uma
 * ação, e todo número tem de bater com a lista que abre ao clicar nele. Por
 * isso as mesmas definições valem em todas as telas (o que é "chegou à
 * visita" é decidido aqui, uma vez).
 */
import { ETAPAS_DE_VISITA_EM_DIANTE as VISITA_EM_DIANTE, ETAPAS_DO_CAMINHO, type EtapaFunil } from "@/lib/types";

/** As etapas do caminho, em ordem. "Perdido" é a saída, não um passo. */
export const CAMINHO_DO_FUNIL: EtapaFunil[] = [...ETAPAS_DO_CAMINHO];

const ETAPAS_DE_VISITA_EM_DIANTE = new Set<EtapaFunil>(VISITA_EM_DIANTE);

/**
 * O lead chegou à visita? O FATO (`visita_agendada_em`) ou a etapa de visita
 * em diante — a mesma regra do funil do bot (0072): nenhuma das duas fontes
 * conta certo sozinha (o corretor move o cartão sem data; a data fica em
 * lead que depois se perdeu).
 */
export function chegouAVisita(lead: { etapa: string; visitaAgendadaEm: string | null }): boolean {
  return lead.visitaAgendadaEm !== null || ETAPAS_DE_VISITA_EM_DIANTE.has(lead.etapa as EtapaFunil);
}

// ─── 1. Passagem do funil ──────────────────────────────────────────────────

export type PassoDoFunil = {
  etapa: EtapaFunil;
  /** Quantos estão NESTA etapa ou além dela. */
  alcancaram: number;
  /** Porcentagem do passo anterior que chegou até aqui (null no primeiro). */
  doAnterior: number | null;
};

/**
 * Quantos chegaram a cada etapa, e quanto do passo anterior passou.
 *
 * A contagem por etapa é da etapa ATUAL, então "chegou à visita" é a soma da
 * visita com tudo o que vem depois dela. Quem se perdeu fica de fora: a etapa
 * atual dele é "perdido" e não diz até onde ele foi — contar como se tivesse
 * parado no começo inventaria um vazamento.
 */
export function passagemDoFunil(contagens: Partial<Record<EtapaFunil, number>>): PassoDoFunil[] {
  const passos: PassoDoFunil[] = [];
  for (let i = 0; i < CAMINHO_DO_FUNIL.length; i++) {
    const alcancaram = CAMINHO_DO_FUNIL.slice(i).reduce((s, e) => s + (contagens[e] ?? 0), 0);
    const anterior = passos[i - 1]?.alcancaram;
    passos.push({
      etapa: CAMINHO_DO_FUNIL[i],
      alcancaram,
      doAnterior: anterior === undefined || anterior === 0 ? null : Math.round((alcancaram / anterior) * 100),
    });
  }
  return passos;
}

/** O passo em que mais gente fica pelo caminho (a menor passagem), para destacar. */
export function maiorVazamento(passos: PassoDoFunil[]): EtapaFunil | null {
  let pior: PassoDoFunil | null = null;
  for (const p of passos) {
    if (p.doAnterior === null) continue;
    if (!pior || p.doAnterior < (pior.doAnterior ?? 101)) pior = p;
  }
  return pior && (pior.doAnterior ?? 100) < 100 ? pior.etapa : null;
}

// ─── 2. Quem está esperando resposta ───────────────────────────────────────

export type FaixaDeEspera = "ate_1h" | "ate_6h" | "ate_24h" | "mais_de_24h";

export const FAIXAS_DE_ESPERA: { faixa: FaixaDeEspera; rotulo: string; ateHoras: number }[] = [
  { faixa: "ate_1h", rotulo: "Menos de 1 hora", ateHoras: 1 },
  { faixa: "ate_6h", rotulo: "1 a 6 horas", ateHoras: 6 },
  { faixa: "ate_24h", rotulo: "6 a 24 horas", ateHoras: 24 },
  { faixa: "mais_de_24h", rotulo: "Mais de 1 dia", ateHoras: Number.POSITIVE_INFINITY },
];

export function faixasDeEspera(
  esperandoDesde: string[],
  agora: Date = new Date(),
): Record<FaixaDeEspera, number> {
  const contagem: Record<FaixaDeEspera, number> = { ate_1h: 0, ate_6h: 0, ate_24h: 0, mais_de_24h: 0 };
  for (const iso of esperandoDesde) {
    const horas = (agora.getTime() - new Date(iso).getTime()) / 3_600_000;
    if (!Number.isFinite(horas)) continue;
    const alvo = FAIXAS_DE_ESPERA.find((f) => horas < f.ateHoras) ?? FAIXAS_DE_ESPERA[3];
    contagem[alvo.faixa] += 1;
  }
  return contagem;
}

// ─── 3. De onde vêm os leads ───────────────────────────────────────────────

export type Canal =
  | "anuncio"
  | "portal"
  | "site"
  | "whatsapp"
  | "indicacao"
  | "importacao"
  | "manual"
  | "outros";

export const ROTULO_DO_CANAL: Record<Canal, string> = {
  anuncio: "Anúncios e impulsionamentos",
  portal: "Portais",
  site: "Site",
  whatsapp: "WhatsApp direto",
  indicacao: "Indicação e parceiros",
  importacao: "Importação",
  manual: "Cadastro manual",
  outros: "Outros",
};

/** A `leads.origem` crua vira um canal que se lê. */
export function canalDaOrigem(origem: string | null | undefined): Canal {
  const o = (origem ?? "").toLowerCase();
  if (o.startsWith("meta/") || o.startsWith("anuncio")) return "anuncio";
  if (o.startsWith("inbound/") || o.startsWith("portal") || o.startsWith("gmail")) return "portal";
  if (o.startsWith("site")) return "site";
  if (o.startsWith("whatsapp")) return "whatsapp";
  if (o.startsWith("indicacao") || o.startsWith("parceiro")) return "indicacao";
  if (o.startsWith("painel/importacao")) return "importacao";
  if (o === "painel" || o.startsWith("painel/manual")) return "manual";
  return "outros";
}

/**
 * Os mesmos canais como padrões de `ilike`, para a lista de leads filtrar
 * (`?canal=`). Mora ao lado de `canalDaOrigem` para os dois não divergirem:
 * a barra do gráfico e a lista que ela abre têm de contar as mesmas pessoas.
 * "Outros" não tem filtro: é o que sobra, e sobra não se escreve como padrão.
 */
export const PADROES_DO_CANAL: Record<Canal, string[] | null> = {
  anuncio: ["meta/%", "anuncio%"],
  portal: ["inbound/%", "portal%", "gmail%"],
  site: ["site%"],
  whatsapp: ["whatsapp%"],
  indicacao: ["indicacao%", "parceiro%"],
  importacao: ["painel/importacao%"],
  manual: ["painel", "painel/manual%"],
  outros: null,
};

export function ehCanal(v: string | undefined): v is Canal {
  return !!v && v in ROTULO_DO_CANAL;
}

export type LinhaDeOrigem = {
  canal: Canal;
  leads: number;
  visitas: number;
  fechados: number;
  /** Gasto conhecido no período (só quem tem: anúncios). */
  gasto: number | null;
  custoPorLead: number | null;
  custoPorVisita: number | null;
};

export function origemDosLeads(
  leads: { origem: string | null; etapa: string; visitaAgendadaEm: string | null }[],
  gastos: Partial<Record<Canal, number>> = {},
): LinhaDeOrigem[] {
  const acc = new Map<Canal, { leads: number; visitas: number; fechados: number }>();
  for (const l of leads) {
    const canal = canalDaOrigem(l.origem);
    const a = acc.get(canal) ?? { leads: 0, visitas: 0, fechados: 0 };
    a.leads += 1;
    if (chegouAVisita(l)) a.visitas += 1;
    if (l.etapa === "fechado") a.fechados += 1;
    acc.set(canal, a);
  }
  // Canal que gastou e não trouxe ninguém também aparece: é o pior resultado.
  for (const canal of Object.keys(gastos) as Canal[]) {
    if ((gastos[canal] ?? 0) > 0 && !acc.has(canal)) acc.set(canal, { leads: 0, visitas: 0, fechados: 0 });
  }
  const dividir = (v: number | null, n: number) => (v === null || n === 0 ? null : Math.round((v / n) * 100) / 100);
  return [...acc.entries()]
    .map(([canal, a]) => {
      const gasto = gastos[canal] ?? null;
      return { canal, ...a, gasto, custoPorLead: dividir(gasto, a.leads), custoPorVisita: dividir(gasto, a.visitas) };
    })
    .sort((x, y) => y.leads - x.leads);
}

// ─── 4. Placar da equipe ───────────────────────────────────────────────────

export type LinhaDoPlacar = {
  corretorId: string;
  nome: string;
  leads: number;
  visitas: number;
  vendas: number;
  /** Visitas que viraram venda, em %, quando houve visita. */
  conversao: number | null;
};

export function placarDaEquipe(
  equipe: { id: string; nome: string }[],
  leads: { corretorId: string | null; etapa: string; visitaAgendadaEm: string | null }[],
  vendas: { corretorId: string }[],
): LinhaDoPlacar[] {
  const linhas = new Map(
    equipe.map((c) => [c.id, { corretorId: c.id, nome: c.nome, leads: 0, visitas: 0, vendas: 0 }]),
  );
  for (const l of leads) {
    const linha = l.corretorId ? linhas.get(l.corretorId) : undefined;
    if (!linha) continue;
    linha.leads += 1;
    if (chegouAVisita(l)) linha.visitas += 1;
  }
  for (const v of vendas) {
    const linha = linhas.get(v.corretorId);
    if (linha) linha.vendas += 1;
  }
  return [...linhas.values()]
    .map((l) => ({ ...l, conversao: l.visitas > 0 ? Math.round((l.vendas / l.visitas) * 100) : null }))
    .sort((a, b) => b.vendas - a.vendas || b.visitas - a.visitas || b.leads - a.leads);
}

// ─── 5. Procura por imóvel ─────────────────────────────────────────────────

export type LinhaDeImovel = {
  id: string;
  nome: string;
  slug: string;
  leads: number;
  visitas: number;
  vendas: number;
};

export function procuraPorImovel(
  imoveis: { id: string; nome: string; slug: string }[],
  leads: {
    empreendimentoId: string | null;
    imovelInteresseId: string | null;
    etapa: string;
    visitaAgendadaEm: string | null;
  }[],
  vendas: { empreendimentoId: string | null }[],
): LinhaDeImovel[] {
  const linhas = new Map(imoveis.map((i) => [i.id, { ...i, leads: 0, visitas: 0, vendas: 0 }]));
  for (const l of leads) {
    // Um lead conta uma vez, pelo imóvel de interesse ou, sem ele, pelo do cadastro.
    const id = l.imovelInteresseId ?? l.empreendimentoId;
    const linha = id ? linhas.get(id) : undefined;
    if (!linha) continue;
    linha.leads += 1;
    if (chegouAVisita(l)) linha.visitas += 1;
  }
  for (const v of vendas) {
    const linha = v.empreendimentoId ? linhas.get(v.empreendimentoId) : undefined;
    if (linha) linha.vendas += 1;
  }
  return [...linhas.values()].sort(
    (a, b) => b.leads - a.leads || b.visitas - a.visitas || b.vendas - a.vendas || a.nome.localeCompare(b.nome),
  );
}

// ─── 6. Onde a meta deveria estar hoje ─────────────────────────────────────

/**
 * Quanto da meta, em reais, deveria estar feito hoje num ritmo constante.
 * Não é previsão: comissão chega em blocos (uma venda é um degrau), e
 * projetar o mês pelo que entrou até agora mentiria nos dois sentidos. É a
 * marca na barra que diz "adiantado" ou "atrasado".
 */
export function esperadoAteHoje(meta: number, diasNoMes: number, diasRestantes: number): number {
  if (meta <= 0 || diasNoMes <= 0) return 0;
  const passados = Math.min(diasNoMes, Math.max(0, diasNoMes - diasRestantes));
  return Math.round(((meta * passados) / diasNoMes) * 100) / 100;
}

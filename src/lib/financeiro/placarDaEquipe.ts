/**
 * Metas da equipe e o placar do mês (0246, 29/10/2026).
 *
 * O gestor define, por corretor e por mês, quantas visitas, propostas e
 * vendas espera. O placar mede o feito contra isso. Tudo aqui é puro: quem lê
 * o banco é `metasDaEquipeDados.ts`, e a régua (o que conta, como empata,
 * quem vê o quê) merece teste sem banco.
 *
 * As medidas e os rótulos moram num lugar só (`ROTULO_DA_MEDIDA`): a frente
 * do vocabulário por ramo troca o texto aqui.
 *
 * ## A régua do progresso
 *
 * - Cada medida: feito ÷ meta, sem teto (130% aparece como 130%).
 * - O geral: a MÉDIA das medidas que têm meta, cada uma com teto de 100%.
 *   Sem o teto, dez vendas acima da meta esconderiam zero visita: o geral é
 *   "quanto do combinado já foi feito", não "quanto se fez".
 * - Medida sem meta não entra na média nem aparece como barra: meta que o
 *   gestor não definiu não é de ninguém.
 *
 * ## Quem vê o quê (privacidade)
 *
 * O gestor vê a equipe inteira, com os números. O corretor vê o PRÓPRIO
 * placar completo, a própria posição e só o pódio (os `TOPO` primeiros) com
 * nome e porcentagem geral — sem os números crus dos colegas. É a mesma
 * linha do ranking de VGV (todos veem posições, comissão é privada): a
 * disputa motiva, a carteira de cada um continua de cada um.
 */

export const MEDIDAS = ["visitas", "propostas", "vendas"] as const;
export type Medida = (typeof MEDIDAS)[number];

export const ROTULO_DA_MEDIDA: Record<Medida, { plural: string; singular: string; explicacao: string }> = {
  visitas: {
    plural: "Visitas",
    singular: "visita",
    explicacao: "Visitas do mês que aconteceram (ou que já passaram e esperam a resposta do corretor).",
  },
  propostas: {
    plural: "Propostas",
    singular: "proposta",
    explicacao: "Leads que entraram na etapa Proposta no mês.",
  },
  vendas: {
    plural: "Vendas",
    singular: "venda",
    explicacao: "Vendas registradas no mês (a mesma conta do ranking de VGV).",
  },
};

/** Quantos o corretor comum vê no pódio do placar. */
export const TOPO = 3;

export type Contagem = Record<Medida, number>;
export type MetasDoMes = Record<Medida, number | null>;

export const SEM_META: MetasDoMes = { visitas: null, propostas: null, vendas: null };
export const NADA_FEITO: Contagem = { visitas: 0, propostas: 0, vendas: 0 };

/** feito ÷ meta, sem teto; `null` sem meta. */
export function progressoDaMedida(feito: number, meta: number | null): number | null {
  if (meta === null || !(meta > 0)) return null;
  return Math.max(0, feito) / meta;
}

/** A média das medidas com meta, cada uma limitada a 100%; `null` sem meta nenhuma. */
export function progressoGeral(metas: MetasDoMes, feito: Contagem): number | null {
  const partes = MEDIDAS.map((m) => progressoDaMedida(feito[m], metas[m])).filter((p): p is number => p !== null);
  if (partes.length === 0) return null;
  return partes.reduce((s, p) => s + Math.min(1, p), 0) / partes.length;
}

/** Porcentagem inteira para a tela (arredonda para baixo: 99,6% não é "100%" de meta batida). */
export function porcento(p: number | null): string {
  return p === null ? "—" : `${Math.floor(p * 100)}%`;
}

export type LinhaDoPlacar = {
  corretorId: string;
  nome: string;
  fotoUrl: string | null;
  metas: MetasDoMes;
  feito: Contagem;
  porMedida: Record<Medida, number | null>;
  geral: number | null;
  /** 1, 2, 3... só para quem tem meta; `null` sem meta. */
  posicao: number | null;
  /** Bateu todas as metas que tem. */
  bateu: boolean;
};

/**
 * O placar do mês, do primeiro ao último. Desempate: vendas, propostas,
 * visitas, nome. Quem não tem meta vai para o fim, sem posição.
 */
export function montarPlacar(
  equipe: readonly { id: string; nome: string; fotoUrl?: string | null }[],
  metas: ReadonlyMap<string, MetasDoMes>,
  feitos: ReadonlyMap<string, Contagem>,
): LinhaDoPlacar[] {
  const linhas = equipe.map((c): LinhaDoPlacar => {
    const m = metas.get(c.id) ?? SEM_META;
    const f = feitos.get(c.id) ?? NADA_FEITO;
    const porMedida = {
      visitas: progressoDaMedida(f.visitas, m.visitas),
      propostas: progressoDaMedida(f.propostas, m.propostas),
      vendas: progressoDaMedida(f.vendas, m.vendas),
    };
    const geral = progressoGeral(m, f);
    return {
      corretorId: c.id,
      nome: c.nome,
      fotoUrl: c.fotoUrl ?? null,
      metas: m,
      feito: f,
      porMedida,
      geral,
      posicao: null,
      bateu: geral !== null && geral >= 1,
    };
  });

  linhas.sort(
    (a, b) =>
      Number(a.geral === null) - Number(b.geral === null) ||
      (b.geral ?? 0) - (a.geral ?? 0) ||
      b.feito.vendas - a.feito.vendas ||
      b.feito.propostas - a.feito.propostas ||
      b.feito.visitas - a.feito.visitas ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  );
  let posicao = 0;
  for (const l of linhas) if (l.geral !== null) l.posicao = ++posicao;
  return linhas;
}

/** O que o corretor comum vê de um colega: nome, foto, posição e o geral. */
export type LinhaDoPodio = Pick<LinhaDoPlacar, "corretorId" | "nome" | "fotoUrl" | "posicao" | "geral" | "bateu">;

/**
 * O recorte do corretor: o pódio (sem números crus) e a própria linha
 * inteira. `participantes` é quantos têm meta, para "3º de 8".
 */
export function placarDoCorretor(
  placar: readonly LinhaDoPlacar[],
  eu: string,
  topo: number = TOPO,
): { podio: LinhaDoPodio[]; minha: LinhaDoPlacar | null; participantes: number } {
  const comMeta = placar.filter((l) => l.posicao !== null);
  return {
    podio: comMeta.slice(0, topo).map(({ corretorId, nome, fotoUrl, posicao, geral, bateu }) => ({
      corretorId,
      nome,
      fotoUrl,
      posicao,
      geral,
      bateu,
    })),
    minha: placar.find((l) => l.corretorId === eu) ?? null,
    participantes: comMeta.length,
  };
}

/**
 * Onde o mês está: a fração dos dias já corridos (contando hoje). É a marca
 * do "ritmo" na barra: quem está atrás dela está atrasado.
 */
export function fracaoDoMes(hoje: string): number {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return Math.min(1, Math.max(0, Number(hoje.slice(8, 10)) / dias));
}

/** O que falta, em trabalho: "faltam 2 vendas e 5 visitas". `null` quando nada falta. */
export function oQueFalta(metas: MetasDoMes, feito: Contagem): string | null {
  const partes = MEDIDAS.flatMap((m) => {
    const meta = metas[m];
    if (meta === null) return [];
    const falta = meta - feito[m];
    if (falta <= 0) return [];
    const r = ROTULO_DA_MEDIDA[m];
    return [`${falta} ${falta === 1 ? r.singular : r.plural.toLowerCase()}`];
  });
  if (partes.length === 0) return null;
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
  return `Faltam ${lista}.`;
}

/** Lê o que o gestor digitou numa meta: vazio = sem meta; inteiro de 1 a 1000. */
export function lerMetaDigitada(v: string | number | null | undefined): number | null | "invalida" {
  if (v === null || v === undefined) return null;
  const texto = String(v).trim();
  if (texto === "" || texto === "0") return null;
  if (!/^\d{1,4}$/.test(texto)) return "invalida";
  const n = Number(texto);
  return n >= 1 && n <= 1000 ? n : "invalida";
}

/**
 * Contagens de visita do mês, pela régua do placar: aconteceu (`realizada`),
 * ou está `marcada` com o horário já passado (o corretor ainda não respondeu
 * "aconteceu?"). Cancelada, falta e "sem confirmação" não contam.
 */
export function visitaConta(v: { status: string; inicio: string }, agora: Date): boolean {
  if (v.status === "realizada") return true;
  return v.status === "marcada" && Date.parse(v.inicio) <= agora.getTime();
}

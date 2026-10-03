/**
 * Listas sugeridas (plano de ativação, Fase 4, 03/10/2026).
 *
 * Substituem o reengajamento automático e a abertura automática de lead de
 * portal: a IA só responde (regra N1), então quem precisa de uma mensagem
 * nossa aparece aqui, agrupado, e o corretor decide quando mandar. Aprovar
 * uma lista cria uma lista de transmissão normal, com a cota e o espaçamento
 * anti-ban do disparador.
 *
 * Módulo puro: quem lê o banco é `listasSugeridasDados.ts`.
 */

export type LeadParaSugestao = {
  id: string;
  nome: string;
  telefone: string | null;
  etapa: string;
  /** Quantas vezes NÓS já falamos com ele (0060). */
  tentativasContato: number;
  /** A última mensagem de qualquer um dos lados, ou nossa última tentativa. */
  ultimoContatoEm: string | null;
  imovel: { slug: string; nome: string } | null;
  naoContatar: boolean;
  arquivado: boolean;
  /** Recebeu lista de transmissão nos últimos 30 dias e não respondeu. */
  reativadoSemResposta: boolean;
};

export type ItemSugerido = { id: string; nome: string; etapa: string; ultimoContatoEm: string | null };

export type ListasSugeridas = {
  novos: ItemSugerido[];
  parados: ItemSugerido[];
  porImovel: { imovel: { slug: string; nome: string }; leads: ItemSugerido[] }[];
};

/** As opções de "parados há X dias" que o corretor escolhe. */
export const DIAS_DE_PARADO = [15, 30, 60] as const;
export type DiasDeParado = (typeof DIAS_DE_PARADO)[number];

/** O `?parados=` da URL; qualquer outro valor vira o padrão de 30 dias. */
export function lerDiasDeParado(valor: string | null | undefined): DiasDeParado {
  const n = Number(valor);
  return (DIAS_DE_PARADO as readonly number[]).includes(n) ? (n as DiasDeParado) : 30;
}

/** Quem recebeu e não respondeu fica fora das sugestões por este tempo. */
export const DIAS_SEM_INSISTIR = 30;

/** Etapa mais avançada primeiro: é quem está mais perto de comprar. */
const ORDEM_DA_ETAPA: Record<string, number> = {
  documentacao: 4,
  visita_agendada: 3,
  primeiro_contato: 2,
  novo: 1,
};

/**
 * Quem pode entrar numa lista sugerida. Fora: quem pediu para não ser
 * contatado, arquivado (inclui os leads de teste, que nascem arquivados),
 * fechado e perdido.
 *
 * Perdido fica de fora embora o plano só cite Fechado: aprovar a lista cria
 * uma lista de transmissão, e a régua dela (`elegivel`) já recusa perdido.
 * Sugerir quem a lista vai descartar seria prometer um número que não sai.
 */
function podeSugerir(l: LeadParaSugestao): boolean {
  if (!l.telefone || l.naoContatar || l.arquivado || l.reativadoSemResposta) return false;
  return l.etapa !== "fechado" && l.etapa !== "perdido";
}

function ordenar(a: LeadParaSugestao, b: LeadParaSugestao): number {
  const etapa = (ORDEM_DA_ETAPA[b.etapa] ?? 0) - (ORDEM_DA_ETAPA[a.etapa] ?? 0);
  if (etapa !== 0) return etapa;
  // Interesse mais recente primeiro.
  return (b.ultimoContatoEm ?? "").localeCompare(a.ultimoContatoEm ?? "");
}

const item = (l: LeadParaSugestao): ItemSugerido => ({
  id: l.id,
  nome: l.nome,
  etapa: l.etapa,
  ultimoContatoEm: l.ultimoContatoEm,
});

export function montarListasSugeridas(
  leads: LeadParaSugestao[],
  opcoes: { diasParado: DiasDeParado; agora?: Date },
): ListasSugeridas {
  const agora = (opcoes.agora ?? new Date()).getTime();
  const corte = agora - opcoes.diasParado * 86_400_000;
  const aptos = leads.filter(podeSugerir).sort(ordenar);

  const novos = aptos.filter((l) => l.tentativasContato === 0 && !l.ultimoContatoEm);
  const paradosLeads = aptos.filter(
    (l) => l.ultimoContatoEm !== null && new Date(l.ultimoContatoEm).getTime() <= corte,
  );

  const grupos = new Map<string, { imovel: { slug: string; nome: string }; leads: ItemSugerido[] }>();
  for (const l of paradosLeads) {
    if (!l.imovel) continue;
    const g = grupos.get(l.imovel.slug) ?? { imovel: l.imovel, leads: [] };
    g.leads.push(item(l));
    grupos.set(l.imovel.slug, g);
  }

  return {
    novos: novos.map(item),
    parados: paradosLeads.map(item),
    porImovel: [...grupos.values()].sort((a, b) => b.leads.length - a.leads.length),
  };
}

/** O público de cada lista, em palavras: é o que a IA usa para sugerir a mensagem. */
export function descreverLista(
  lista: "novos" | "parados" | "imovel",
  contexto: { diasParado?: number; imovel?: string | null } = {},
): string {
  if (lista === "novos") return "leads novos que ainda não receberam nenhuma mensagem";
  if (lista === "imovel") {
    return `leads sem conversa há ${contexto.diasParado ?? 30} dias que tinham interesse no ${contexto.imovel ?? "imóvel"}`;
  }
  return `leads sem conversa há ${contexto.diasParado ?? 30} dias`;
}

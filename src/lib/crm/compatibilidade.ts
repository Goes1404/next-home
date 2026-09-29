/**
 * O quanto um lead combina com um imóvel (26/09/2026).
 *
 * Serve às duas pontas do mesmo cruzamento:
 * - imóvel novo → quais leads já procuravam algo assim (campanha em um toque);
 * - lead → quais imóveis mostrar na seleção personalizada.
 *
 * ## A régua: só o que o cliente DISSE conta
 *
 * Os critérios são os que o lead declarou (região, dormitórios, orçamento).
 * Critério não declarado não pontua e não reprova — e lead sem NENHUM
 * critério não combina com nada: "combina com tudo" encheria a campanha de
 * gente sobre quem não sabemos nada, que é exatamente o disparo que ninguém
 * responde (88 entregues, 1 resposta, medido em 31/08).
 *
 * E um critério declarado que o imóvel NÃO atende reprova. Oferecer 2
 * dormitórios a quem pediu 3 não é "quase": é a mensagem que ensina o
 * cliente a ignorar a próxima.
 */

import { simularFinanciamento } from "@/lib/consultor/financiamento";
import type { ParametrosCredito } from "@/lib/credito/tipos";

export type PerfilDoLead = {
  regiaoInteresse?: string | null;
  dormitoriosMin?: number | null;
  orcamentoMax?: number | null;
  /**
   * O que a renda declarada financia (`tetoPelaRenda`). Só vale quando o
   * cliente não disse um orçamento: orçamento é o que ele QUER gastar, e
   * isso manda mais que a conta do banco.
   */
  tetoPelaRenda?: number | null;
};

export type ImovelParaCompatibilidade = {
  cidade: string;
  bairro: string;
  precoAPartir: number | null;
  /** Dormitórios de cada planta cadastrada. */
  dormitorios: number[];
};

export type Compatibilidade = {
  combina: boolean;
  /** 0–100, só para ordenar. */
  pontos: number;
  motivos: string[];
};

/** Folga do orçamento: quem disse "até 500 mil" costuma olhar 520. */
export const FOLGA_ORCAMENTO = 1.1;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Palavras que não identificam lugar ("zona", "regiao", "de"). */
const VAZIAS = new Set(["de", "da", "do", "das", "dos", "e", "em", "na", "no", "zona", "regiao", "perto", "sp", "centro"]);

function termos(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((t) => t.length >= 3 && !VAZIAS.has(t));
}

/**
 * A região declarada casa com o bairro ou a cidade do imóvel quando algum
 * termo significativo de um aparece no outro. "Alphaville" casa com
 * "Alphaville Empresarial"; "Barueri" casa com a cidade Barueri.
 */
export function regiaoCasa(regiao: string, imovel: Pick<ImovelParaCompatibilidade, "cidade" | "bairro">): boolean {
  const lugar = normalizar(`${imovel.bairro} ${imovel.cidade}`);
  return termos(regiao).some((t) => lugar.includes(t));
}

export function compatibilidade(lead: PerfilDoLead, imovel: ImovelParaCompatibilidade): Compatibilidade {
  const motivos: string[] = [];
  let pontos = 0;
  let criterios = 0;

  const regiao = lead.regiaoInteresse?.trim();
  if (regiao) {
    criterios++;
    if (!regiaoCasa(regiao, imovel)) return { combina: false, pontos: 0, motivos: [] };
    pontos += 40;
    motivos.push(`região (${regiao})`);
  }

  const dorms = lead.dormitoriosMin;
  if (dorms && dorms > 0 && imovel.dormitorios.length > 0) {
    criterios++;
    if (!imovel.dormitorios.some((d) => d >= dorms)) return { combina: false, pontos: 0, motivos: [] };
    pontos += 30;
    motivos.push(`${dorms}+ dormitórios`);
  }

  const declarado = lead.orcamentoMax && lead.orcamentoMax > 0 ? lead.orcamentoMax : null;
  const teto = declarado ?? (lead.tetoPelaRenda && lead.tetoPelaRenda > 0 ? lead.tetoPelaRenda : null);
  if (teto && imovel.precoAPartir) {
    criterios++;
    if (imovel.precoAPartir > teto * FOLGA_ORCAMENTO) return { combina: false, pontos: 0, motivos: [] };
    pontos += 30;
    motivos.push(declarado ? "cabe no orçamento" : "cabe no que a renda financia");
  }

  if (criterios === 0) return { combina: false, pontos: 0, motivos: [] };
  return { combina: true, pontos, motivos };
}

/**
 * O valor de imóvel que a renda declarada sustenta, sem entrada nem FGTS —
 * a leitura conservadora. É a MESMA conta do consultor e do simulador
 * público (`simularFinanciamento`): duas contas do mesmo financiamento
 * divergiriam, e o cliente ouviria um número no site e outro do corretor.
 */
export function tetoPelaRenda(renda: number | null | undefined, params: ParametrosCredito): number | null {
  if (!renda || renda <= 0) return null;
  // `valorImovel` só pesa no teto do FGTS, que aqui é zero.
  const teto = simularFinanciamento({ rendaMensal: renda, entrada: 0, valorImovel: 1 }, params).precoMaximo;
  return teto > 0 ? teto : null;
}

/**
 * Junta o que o lead declarou na ficha com o que a IA extraiu da conversa
 * (`lead_observacoes_ia`). A ficha manda; o dossiê só preenche o vazio — é o
 * cliente que o corretor ouviu contra o que um modelo leu.
 */
export function perfilDoLead(
  lead: {
    regiao_interesse?: string | null;
    dormitorios_min?: number | null;
    orcamento_max?: number | string | null;
    renda_mensal?: number | string | null;
  },
  dossie: { orcamento_max?: number | string | null } | null | undefined,
  params: ParametrosCredito,
): PerfilDoLead {
  const numero = (v: number | string | null | undefined) => (v != null && Number(v) > 0 ? Number(v) : null);
  return {
    regiaoInteresse: lead.regiao_interesse,
    dormitoriosMin: lead.dormitorios_min,
    // `numeric` chega como string no supabase-js.
    orcamentoMax: numero(lead.orcamento_max) ?? numero(dossie?.orcamento_max),
    tetoPelaRenda: tetoPelaRenda(numero(lead.renda_mensal), params),
  };
}

/** Os que combinam, do mais para o menos compatível. */
export function ordenarCompativeis<T>(
  itens: T[],
  avaliar: (item: T) => Compatibilidade,
): Array<T & { compat: Compatibilidade }> {
  return itens
    .map((item) => ({ ...item, compat: avaliar(item) }))
    .filter((i) => i.compat.combina)
    .sort((a, b) => b.compat.pontos - a.compat.pontos);
}

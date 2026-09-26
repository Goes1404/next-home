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

export type PerfilDoLead = {
  regiaoInteresse?: string | null;
  dormitoriosMin?: number | null;
  orcamentoMax?: number | null;
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

  const teto = lead.orcamentoMax;
  if (teto && teto > 0 && imovel.precoAPartir) {
    criterios++;
    if (imovel.precoAPartir > teto * FOLGA_ORCAMENTO) return { combina: false, pontos: 0, motivos: [] };
    pontos += 30;
    motivos.push("cabe no orçamento");
  }

  if (criterios === 0) return { combina: false, pontos: 0, motivos: [] };
  return { combina: true, pontos, motivos };
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

/**
 * Match automático de imóveis × leads (29/10/2026).
 *
 * Em cima de `compatibilidade.ts`, que decide SE combina (só o que o cliente
 * disse conta; critério declarado que o imóvel não atende reprova), esta
 * camada ORDENA e explica: o que fica perto do orçamento, a planta exata que
 * ele pediu, o pronto para morar para quem tem pressa, e o imóvel que ele
 * mesmo perguntou. Serve às duas pontas:
 *
 * - ficha do lead → "Imóveis que combinam" (os 5 melhores, com os motivos);
 * - imóvel publicado → "Leads que combinam com <imóvel>" (cada corretor, só
 *   a carteira dele) e o aviso no celular (`avisoDeMatch.ts`).
 *
 * Pura: quem chama lê o catálogo e a carteira do grupo certo.
 */

import { compatibilidade, FOLGA_ORCAMENTO, type ImovelParaCompatibilidade, type PerfilDoLead } from "./compatibilidade";

export type PreferenciasDoLead = PerfilDoLead & {
  /** O orçamento mínimo declarado (ficha ou dossiê): abaixo dele, o imóvel parece "pouco". */
  orcamentoMin?: number | null;
  /** O dossiê disse que a mudança é para já ("urgente", "imediata", "este mês"). */
  temPressa?: boolean;
  /** Os imóveis que o próprio lead pediu (o de interesse da ficha, o do anúncio). */
  pediu?: string[];
};

export type ImovelParaMatch = ImovelParaCompatibilidade & {
  id: string;
  /** `status_obra` do catálogo. */
  status?: string | null;
};

export type Match = { pontos: number; motivos: string[] };

const PRONTO = new Set(["pronto_para_morar"]);
const LONGE_DAS_CHAVES = new Set(["breve_lancamento", "pre_lancamento", "lancamento"]);

/** Do texto livre do dossiê (`urgencia_mudanca`): o cliente quer mudar logo? */
export function temPressaDeMudar(urgencia: string | null | undefined): boolean {
  if (!urgencia) return false;
  const t = urgencia
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/\b(sem pressa|nao tem pressa|sem urgencia|longo prazo|ano que vem|proximo ano)\b/.test(t)) return false;
  return /\b(urgente|urgencia|imediat\w*|ja|logo|este mes|esse mes|proximo mes|o quanto antes|rapido|pressa)\b/.test(t);
}

/**
 * Os pontos de um imóvel para um lead, ou `null` quando não combina.
 *
 * - Base: os pontos de `compatibilidade` (região 40, dormitórios 30,
 *   orçamento 30). Sem critério declarado, só o imóvel pedido entra.
 * - Pedido pelo próprio lead: +50 e entra mesmo se algum critério reprovar
 *   (é sobre ele que o cliente perguntou; o corretor decide o que dizer).
 * - Perto do teto do orçamento (70% a 110%): +10 — é o imóvel que ele pode
 *   comprar, não o que "cabe" com folga demais e parece pouco.
 * - Abaixo de 60% do orçamento MÍNIMO declarado: −10.
 * - Planta exata com os dormitórios pedidos: +5.
 * - Com pressa: pronto para morar +15; lançamento −10.
 */
export function pontuarImovel(pref: PreferenciasDoLead, imovel: ImovelParaMatch): Match | null {
  const pedido = (pref.pediu ?? []).includes(imovel.id);
  const c = compatibilidade(pref, imovel);
  if (!c.combina && !pedido) return null;

  const motivos = pedido ? ["é o imóvel que ele pediu", ...c.motivos] : [...c.motivos];
  let pontos = (c.combina ? c.pontos : 0) + (pedido ? 50 : 0);

  const declarado = pref.orcamentoMax && pref.orcamentoMax > 0 ? pref.orcamentoMax : null;
  const teto = declarado ?? (pref.tetoPelaRenda && pref.tetoPelaRenda > 0 ? pref.tetoPelaRenda : null);
  if (teto && imovel.precoAPartir) {
    const razao = imovel.precoAPartir / teto;
    if (razao >= 0.7 && razao <= FOLGA_ORCAMENTO) {
      pontos += 10;
      motivos.push("perto do teto do orçamento");
    }
  }
  if (pref.orcamentoMin && pref.orcamentoMin > 0 && imovel.precoAPartir && imovel.precoAPartir < pref.orcamentoMin * 0.6) {
    pontos -= 10;
  }

  const dorms = pref.dormitoriosMin;
  if (dorms && dorms > 0 && imovel.dormitorios.includes(dorms)) {
    pontos += 5;
    motivos.push(`planta com ${dorms} dormitório${dorms > 1 ? "s" : ""}`);
  }

  if (pref.temPressa && imovel.status) {
    if (PRONTO.has(imovel.status)) {
      pontos += 15;
      motivos.push("pronto para morar (tem pressa)");
    } else if (LONGE_DAS_CHAVES.has(imovel.status)) {
      pontos -= 10;
    }
  }

  return { pontos, motivos };
}

/**
 * Os imóveis do catálogo que combinam com o lead, do melhor para o pior
 * (empate: o mais barato primeiro, que é o que menos assusta), até `limite`.
 */
export function imoveisQueCombinam<T extends ImovelParaMatch>(
  pref: PreferenciasDoLead,
  catalogo: T[],
  limite = 5,
): Array<T & { match: Match }> {
  return catalogo
    .map((imovel) => ({ imovel, match: pontuarImovel(pref, imovel) }))
    .filter((x): x is { imovel: T; match: Match } => x.match !== null)
    .sort(
      (a, b) =>
        b.match.pontos - a.match.pontos ||
        (a.imovel.precoAPartir ?? Number.POSITIVE_INFINITY) - (b.imovel.precoAPartir ?? Number.POSITIVE_INFINITY),
    )
    .slice(0, limite)
    .map(({ imovel, match }) => ({ ...imovel, match }));
}

/**
 * Os leads de uma carteira que combinam com UM imóvel, do melhor para o pior.
 * O imóvel pedido pelo lead conta (`pediu`), como na outra ponta.
 */
export function leadsQueCombinam<L>(
  imovel: ImovelParaMatch,
  leads: L[],
  preferencias: (lead: L) => PreferenciasDoLead,
): Array<L & { match: Match }> {
  return leads
    .map((lead) => ({ lead, match: pontuarImovel(preferencias(lead), imovel) }))
    .filter((x): x is { lead: L; match: Match } => x.match !== null)
    .sort((a, b) => b.match.pontos - a.match.pontos)
    .map(({ lead, match }) => ({ ...lead, match }));
}

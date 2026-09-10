import type { ConversaResumo } from "./ConversasClient";

/**
 * O deep link tem de abrir a conversa, mesmo fora da página carregada.
 *
 * ## O defeito, medido (10/09/2026)
 *
 * A tela carrega as **100** conversas mais recentes; existem **140**. Tocar
 * numa das 40 mais antigas pela lista de Pessoas manda
 * `/corretor/conversas?c=<id>` — a conversa não estava na lista, `selecionada`
 * ficava `null`, e no celular o painel é `hidden md:flex`. Ou seja: a pessoa
 * tocava e **a tela não mudava**. Nem erro, nem tela vazia, nada.
 *
 * Falha calada da pior espécie: quem toca conclui que o painel travou.
 *
 * ## Por que não é só aumentar o teto
 *
 * Subir de 100 para 300 empurra o problema para o dia em que houver 301
 * conversas — e a lista é a tela mais aberta do painel, então o teto existe
 * por um motivo. O conserto é o deep link buscar A CONVERSA que ele nomeia,
 * uma consulta a mais, e só quando ela de fato falta.
 *
 * Módulo PURO: a ordenação é testável sem banco, e é ela que decide onde a
 * conversa reaparece na lista enquanto a pessoa a lê.
 */

/** O deep link aponta para fora da página carregada? */
export function faltaNaLista(lista: ConversaResumo[], id: string | null): boolean {
  if (!id) return false;
  return !lista.some((c) => c.id === id);
}

/** Instante da última interação, para ordenar. Sem data vai para o fim. */
const quando = (c: ConversaResumo): number => {
  const t = c.ultimaInteracaoEm ? Date.parse(c.ultimaInteracaoEm) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/**
 * Devolve a lista com a conversa do deep link no LUGAR certo.
 *
 * No lugar, e não no fim: a lista é ordenada por última interação, e jogar a
 * conversa aberta para o fim a faria pular de posição na frente de quem está
 * lendo.
 */
export function garantirNaLista(
  lista: ConversaResumo[],
  extra: ConversaResumo | null,
): ConversaResumo[] {
  if (!extra) return lista;
  if (lista.some((c) => c.id === extra.id)) return lista;
  return [...lista, extra].sort((a, b) => quando(b) - quando(a));
}

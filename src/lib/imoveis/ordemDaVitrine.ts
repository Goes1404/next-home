/**
 * A ordem em que o SITE mostra os imóveis, como uma lista que o corretor
 * rearranja no painel.
 *
 * A regra do site já existia (`ordenar(…, "destaque")` em `queries.ts`):
 * primeiro os marcados como destaque, depois o resto, e dentro de cada grupo a
 * coluna `empreendimentos.ordem`. O que não existia era jeito de mexer nela —
 * `ordem` nunca teve tela, e a lista seguia a ordem em que o seed a deixou.
 *
 * Por isso a lista daqui tem DOIS grupos, e mover um imóvel não atravessa a
 * fronteira: se a tela deixasse um imóvel comum subir acima de um destaque, o
 * site o devolveria para baixo, e o corretor veria a lista mentir. Atravessar
 * é marcar ou desmarcar o destaque, que é o que de fato muda de grupo.
 *
 * Módulo puro: a mesma conta serve à tela e ao teste.
 */

export type ItemDaVitrine = {
  slug: string;
  nome: string;
  destaque: boolean;
};

/** A home mostra os seis primeiros desta lista em "Selecionados". */
export const NA_HOME = 6;

/**
 * Ordena como o site ordena. A entrada já vem por `ordem` (a consulta do
 * painel faz `.order("ordem")`), e `sort` é estável: basta separar os grupos.
 */
export function ordemDoSite<T extends ItemDaVitrine>(itens: T[]): T[] {
  return [...itens].sort((a, b) => Number(b.destaque) - Number(a.destaque));
}

/** Troca com o vizinho, desde que os dois estejam no mesmo grupo. */
export function podeMover(lista: ItemDaVitrine[], indice: number, direcao: -1 | 1): boolean {
  const alvo = indice + direcao;
  if (indice < 0 || indice >= lista.length || alvo < 0 || alvo >= lista.length) return false;
  return lista[indice].destaque === lista[alvo].destaque;
}

export function mover<T extends ItemDaVitrine>(lista: T[], indice: number, direcao: -1 | 1): T[] {
  if (!podeMover(lista, indice, direcao)) return lista;
  const nova = [...lista];
  const alvo = indice + direcao;
  [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
  return nova;
}

/**
 * Marcar destaque põe o imóvel no FIM dos destaques; desmarcar põe no COMEÇO
 * dos demais. Nos dois casos ele fica encostado na fronteira, perto de onde
 * estava — sumir para o outro extremo da lista faria o toque parecer perdido.
 */
export function alternarDestaque<T extends ItemDaVitrine>(lista: T[], slug: string): T[] {
  const item = lista.find((i) => i.slug === slug);
  if (!item) return lista;
  const trocado = { ...item, destaque: !item.destaque };
  const resto = lista.filter((i) => i.slug !== slug);
  const fronteira = resto.filter((i) => i.destaque).length;
  return [...resto.slice(0, fronteira), trocado, ...resto.slice(fronteira)];
}

/**
 * O que vai para o banco. `ordem` em passos de 10 deixa espaço para um
 * cadastro novo (que nasce com `ordem = 0`… e aparece primeiro no seu grupo,
 * que é onde o corretor espera ver o que acabou de criar).
 */
export function paraGravar(lista: Pick<ItemDaVitrine, "slug" | "destaque">[]): { slug: string; ordem: number; destaque: boolean }[] {
  return lista.map((item, i) => ({ slug: item.slug, ordem: (i + 1) * 10, destaque: item.destaque }));
}

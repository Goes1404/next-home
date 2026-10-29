/**
 * Qual imóvel do catálogo e qual corretor um lead de fora cita (29/10/2026).
 *
 * Funções puras, tiradas de `processarEmailDeLead` quando o webhook dos
 * portais passou a usar o mesmo caminho (`gravarLeadsRecebidos`). Quem chama
 * passa SÓ o catálogo e a equipe do grupo do lead (L08).
 */

export type ImovelDoCatalogo = {
  id: string;
  nome: string;
  slug: string;
  codigo_legado?: string | null;
  nomes_alternativos?: string[] | null;
};

const limpar = (t: string) => t.trim().toLowerCase();

/**
 * O código do anúncio primeiro, depois o nome.
 *
 * - Código: o portal manda o código que o ANUNCIANTE deu ao imóvel
 *   (`clientListingId` no Grupo OLX). Casa exato com `codigo_legado` (o
 *   código do sistema anterior / do feed), com o slug ou com o id. Exato de
 *   propósito: "A12" não pode casar com "A123".
 * - Nome: a regra do e-mail desde 26/09 — o texto cita o nome ou o slug, ou
 *   o nome contém o texto. Mais os apelidos (`nomes_alternativos`, como o
 *   cliente chama o imóvel), com no mínimo 4 letras para não casar por acaso.
 */
export function casarImovel(
  citado: { termo: string | null; codigo: string | null },
  catalogo: ImovelDoCatalogo[],
): string | null {
  const codigo = citado.codigo ? limpar(citado.codigo) : "";
  if (codigo) {
    const porCodigo = catalogo.find(
      (e) =>
        (e.codigo_legado && limpar(e.codigo_legado) === codigo) || limpar(e.slug) === codigo || e.id.toLowerCase() === codigo,
    );
    if (porCodigo) return porCodigo.id;
  }

  const termo = limpar(citado.termo || citado.codigo || "");
  if (!termo) return null;
  const porNome = catalogo.find(
    (e) => termo.includes(e.nome.toLowerCase()) || termo.includes(e.slug.toLowerCase()) || e.nome.toLowerCase().includes(termo),
  );
  if (porNome) return porNome.id;

  const porApelido = catalogo.find((e) =>
    (e.nomes_alternativos ?? []).some((a) => {
      const apelido = limpar(a);
      return apelido.length >= 4 && termo.includes(apelido);
    }),
  );
  return porApelido?.id ?? null;
}

/** O corretor citado no texto do lead ("falar com a Bruna"), pelo nome ou slug. */
export function casarCorretor(
  citado: string | null,
  equipe: { id: string; nome: string; slug: string | null }[],
): string | null {
  if (!citado) return null;
  const nomeC = citado.toLowerCase();
  const achado = equipe.find(
    (c) =>
      nomeC.includes(c.nome.toLowerCase()) ||
      (c.slug ? nomeC.includes(c.slug.toLowerCase()) : false) ||
      c.nome.toLowerCase().includes(nomeC),
  );
  return achado?.id ?? null;
}

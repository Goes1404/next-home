/**
 * Variantes responsivas das imagens do catálogo — a parte PURA, sem sharp,
 * sem Supabase, importável do servidor, do cliente e do loader do
 * `next/image`.
 *
 * ## Por que existe
 *
 * Desde 09/10/2026 as imagens saem sem o otimizador da Vercel (a cota mensal
 * do Hobby acabou e ele passou a responder 402 — foto quebrada, calada).
 * Com isso o arquivo original ia cru ao navegador: 70 a 430 KB por capa na
 * listagem, sem `srcset`, para um cartão de ~360px no celular. É o que
 * segurava o LCP da listagem e da página do imóvel acima de 3 s na primeira
 * visita.
 *
 * ## O contrato
 *
 * - `registrarMidia` (e o backfill) geram WebP em `LARGURAS_VARIANTES` — só
 *   as MENORES que o original, nunca ampliando — e sobem cada uma ao lado do
 *   arquivo: `foto-abc.jpg` → `foto-abc.w480.webp`. A coluna
 *   `midias.variantes` lista as larguras que de fato existem.
 * - Quem renderiza um `Midia` passa `srcDaMidia(m)` ao `<Image>`: a URL
 *   original mais um FRAGMENTO (`#v=480,960`) dizendo quais variantes
 *   existem. Fragmento, não query: o navegador não o manda ao servidor, e a
 *   URL continua sendo a do arquivo. O `url` cru do `Midia` NÃO muda — ele
 *   vai para o WhatsApp como anexo e para o Lightbox como link.
 * - O loader (`loaderDeImagem.ts`) recebe `src` + `width` do `next/image`,
 *   lê o fragmento e devolve a menor variante que atende à largura pedida.
 *   Pedido maior que todas as variantes devolve o ORIGINAL — ampliar uma
 *   variante seria perder nitidez, e o que este caminho promete é peso
 *   menor sem perder qualidade. URL sem fragmento volta como veio.
 *
 * Por que uma marca na URL e não uma consulta: o loader é função pura
 * chamada no cliente para cada candidato do `srcset`; ele não tem como
 * saber, sozinho, se o Storage tem a variante. Sem a marca, um candidato
 * 404 quebra a foto inteira (o navegador não cai para o próximo).
 */

export const LARGURAS_VARIANTES = [480, 960, 1440] as const;

const MARCA = "#v=";

/** Caminho (ou URL) da variante WebP de uma largura, ao lado do original. */
export function caminhoDaVariante(caminhoOuUrl: string, largura: number): string {
  return caminhoOuUrl.replace(/\.[a-z0-9]+$/i, `.w${largura}.webp`);
}

/** Larguras que valem gerar para um original desta largura (só as menores). */
export function largurasParaGerar(larguraOriginal: number | null): number[] {
  if (!larguraOriginal) return [];
  return LARGURAS_VARIANTES.filter((w) => w < larguraOriginal);
}

/** A URL do `<Image>`: original + a lista das variantes que existem. */
export function marcarVariantes(url: string, variantes: readonly number[] | null | undefined): string {
  const lista = (variantes ?? []).filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (lista.length === 0) return url;
  return `${url}${MARCA}${lista.join(",")}`;
}

export function srcDaMidia(midia: { url: string; variantes?: readonly number[] | null }): string {
  return marcarVariantes(midia.url, midia.variantes);
}

/** O que o loader do `next/image` faz com cada candidato do `srcset`. */
export function resolverVariante(src: string, larguraPedida: number): string {
  const i = src.indexOf(MARCA);
  if (i < 0) return src;

  const original = src.slice(0, i);
  const disponiveis = src
    .slice(i + MARCA.length)
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);

  const alvo = disponiveis.find((w) => w >= larguraPedida);
  return alvo ? caminhoDaVariante(original, alvo) : original;
}

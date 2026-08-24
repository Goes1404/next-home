/**
 * Limites da importação por PDF, isolados do módulo que os usa.
 *
 * Eles moram sozinhos porque o `OrigemPdf` é um componente CLIENTE e precisa
 * do teto de bytes para recusar o arquivo antes do upload. Importá-lo de
 * `pdfImagens.ts` arrastava aquele módulo — e o `sharp`, que é binário
 * nativo do Node — para o grafo do cliente; em produção a rota do imóvel
 * quebrava com "Failed to load external module sharp / libvips-cpp.so", que
 * chega ao visitante como o erro genérico de Server Components.
 *
 * Constante compartilhada entre servidor e cliente não pode viajar dentro de
 * um módulo com dependência nativa.
 */

/** Deck de 80 páginas não pode virar 80 mídias. */
export const TETO_IMAGENS = 60;

/** Deck maior que isto não é apresentação: é catálogo inteiro da construtora. */
export const TETO_PDF_BYTES = 25 * 1024 * 1024;

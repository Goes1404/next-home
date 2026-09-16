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

/**
 * Teto do arquivo que o navegador aceita mandar.
 *
 * O número NÃO é escolha de produto: é a parede do Supabase. O plano do
 * projeto é o FREE, e nele o limite de upload por arquivo é de 50 MB tanto
 * no projeto quanto no bucket `empreendimentos`. Pedir mais que isso à
 * Management API devolve HTTP 402 ("Please upgrade the project to a paid
 * plan to unlock higher file size limits"), medido em 13/09/2026. Subir
 * este número sozinho só troca a recusa da nossa tela por uma recusa do
 * Storage depois do upload começar — pior para quem está esperando.
 *
 * Para passar de 50 MB há dois caminhos, e os dois são decisão de fora
 * daqui: o plano Pro (teto de 50 GB por arquivo) ou extrair as imagens no
 * próprio navegador, sem nunca mandar o PDF para lugar nenhum.
 */
export const TETO_PDF_BYTES = 50 * 1024 * 1024;

/** Derivado, nunca escrito à mão: a mensagem da tela citava "25 MB" mesmo
 * depois de o teto mudar, que é como um texto passa a mentir sozinho. */
export const TETO_PDF_MB = Math.round(TETO_PDF_BYTES / 1024 / 1024);
